#define FUSE_USE_VERSION 30
#include <fuse.h>
#include <fuse/fuse_lowlevel.h>
#include <fuse/fuse_lowlevel_compat.h>
#include <errno.h>
#include <pthread.h>
#include <glib.h>

#include "js-fuse.h"
#include "js.h"
#include "main.h"

// {{{ Fuse

static GSList* fs_list;

typedef struct
{
	JsRef* ref;
	struct fuse_session *session;
	struct fuse_chan *chan;
	char* mountpoint;
	GThread* thread;
	pthread_t thread_pt;
} Fuse;

static void fuse_free(Fuse* fs)
{
	if (fs) {
		if (fs->session)
			fuse_session_exit(fs->session);

		if (fs->thread) {
			pthread_kill(fs->thread_pt, SIGINT);
			g_thread_join(fs->thread);
		}

		fuse_unmount(fs->mountpoint, fs->chan);
		fuse_session_destroy(fs->session);

		free(fs->mountpoint);
		js_ref_drop(fs->ref);

		g_free(fs);
	}
}

// }}}
// {{{ Event

typedef enum {
	EVENT_NONE = 0,
	EVENT_LOOKUP,
	EVENT_GETATTR,
	EVENT_READDIR,
	EVENT_OPEN,
	EVENT_READ,
	EVENT_ERROR
} EventType;

typedef struct {
	Fuse* fs;
	EventType type;

	gchar* name;
	fuse_req_t req;
	fuse_ino_t ino;
	fuse_ino_t parent;
	size_t size;
	off_t off;
	struct fuse_file_info *fi;
	gchar* error_code;
	gchar* error_message;
} Event;

static Event* event_new(Fuse* fs, EventType type)
{
	Event* event = g_slice_new0(Event);

	event->fs = fs;
	event->type = type;

	return event;
}

static Event* event_new_req(fuse_req_t req, EventType type)
{
	Event* event = event_new(fuse_req_userdata(req), type);

	event->req = req;

	return event;
}

static void event_free(Event* event)
{
	if (event) {
		g_clear_pointer(&event->name, g_free);
		g_clear_pointer(&event->error_code, g_free);
		g_clear_pointer(&event->error_message, g_free);

		g_slice_free(Event, event);
	}
}

static gboolean emit_idle(Event* event)
{
	// get method name
	const gchar* method_name = NULL;
	switch (event->type) {
		case EVENT_LOOKUP:
			method_name = "lookup";
			break;
		case EVENT_GETATTR:
			method_name = "getattr";
			break;
		case EVENT_READDIR:
			method_name = "readdir";
			break;
		case EVENT_OPEN:
			method_name = "open";
			break;
		case EVENT_READ:
			method_name = "read";
			break;
		case EVENT_ERROR:
			method_name = "error";
			break;
		default: 
			g_assert_not_reached();
	}

	// lookup method name in the fuse js object
	duk_context* ctx = js_ref_push(event->fs->ref);

	if (js_get_object_function(ctx, -1, method_name)) {
		duk_dup(ctx, -2);
		duk_remove(ctx, -3);

		gint args = 0;
		switch (event->type) {
			case EVENT_LOOKUP:
				duk_push_pointer(ctx, event);
				js_push_uint64(ctx, event->parent);
				duk_push_string(ctx, event->name);
				args = 3;
				break;
			case EVENT_GETATTR:
				duk_push_pointer(ctx, event);
				js_push_uint64(ctx, event->ino);
				args = 2;
				break;
			case EVENT_READDIR:
				duk_push_pointer(ctx, event);
				js_push_uint64(ctx, event->ino);
				args = 2;
				break;
			case EVENT_READ:
				duk_push_pointer(ctx, event);
				js_push_uint64(ctx, event->ino);
				js_push_uint64(ctx, event->size);
				js_push_uint64(ctx, event->off);
				args = 4;
				break;
			case EVENT_OPEN:
				duk_push_pointer(ctx, event);
				js_push_uint64(ctx, event->ino);

				int flags = event->fi->flags & O_ACCMODE;
				if (flags == O_RDONLY)
					duk_push_string(ctx, "r");
				else if (flags == O_WRONLY)
					duk_push_string(ctx, "w");
				else if (flags == O_RDWR)
					duk_push_string(ctx, "rw");
				else
					duk_push_undefined(ctx);

				args = 3;
				break;
			case EVENT_ERROR:
				duk_push_string(ctx, event->error_code);
				duk_push_string(ctx, event->error_message);
				event_free(event);
				args = 2;
				break;
			default:
				g_assert_not_reached();
		}
		
		if (duk_pcall_method(ctx, args))
			js_handle_exception(ctx, "[fuse callback]");
	}

	duk_pop(ctx);

	return FALSE;
}

static void emit(Event* event)
{
	g_idle_add((GSourceFunc)emit_idle, event);
}

static void emit_error(Fuse* fs, const gchar* code, const gchar* fmt, ...)
{
	va_list args;
	va_start(args, fmt);
	gchar* message = g_strdup_vprintf(fmt, args);
	va_end(args);

	Event* event = event_new(fs, EVENT_ERROR);
	event->error_code = g_strdup(code);
	event->error_message = message;
	emit(event);
}

// }}}
// {{{ fuse_ops -> events

static void fs_lookup(fuse_req_t req, fuse_ino_t parent, const char *name)
{
	Event* event = event_new_req(req, EVENT_LOOKUP);
	
	event->parent = parent;
	event->name = g_strdup(name);

	emit(event);
}

static void fs_getattr(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi)
{
	Event* event = event_new_req(req, EVENT_GETATTR);
	
	event->req = req;
	event->ino = ino;

	emit(event);
}

static void fs_readdir(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off, struct fuse_file_info *fi)
{
	Event* event = event_new_req(req, EVENT_READDIR);
	
	event->ino = ino;
	event->size = size;
	event->off = off;

	emit(event);
}


static void fs_open(fuse_req_t req, fuse_ino_t ino, struct fuse_file_info *fi)
{
	Event* event = event_new_req(req, EVENT_OPEN);
	
	event->ino = ino;
	event->fi = fi;

	emit(event);
}

static void fs_read(fuse_req_t req, fuse_ino_t ino, size_t size, off_t off, struct fuse_file_info *fi)
{
	Event* event = event_new_req(req, EVENT_READ);
	
	event->ino = ino;
	event->size = size;
	event->off = off;
	event->fi = fi;

	emit(event);
}

static const struct fuse_lowlevel_ops fuse_ops = {
	.lookup = fs_lookup,
	.getattr = fs_getattr,
	.readdir = fs_readdir,
	.open = fs_open,
	.read = fs_read,
};

// }}}
// {{{ fuse object methods that handle replies

#define min(x, y) ((x) < (y) ? (x) : (y))

static int reply_buf_limited(fuse_req_t req, const char *buf, size_t bufsize, off_t off, size_t maxsize)
{
	if (off < bufsize)
		return fuse_reply_buf(req, buf + off, min(bufsize - off, maxsize));
	else
		return fuse_reply_buf(req, NULL, 0);
}

static void add_dirent(GString* buf, const gchar* name, mode_t mode, ino_t ino)
{
	gsize last_size = buf->len;
	g_string_set_size(buf, buf->len + fuse_dirent_size(strlen(name)));

	struct stat stbuf;
	memset(&stbuf, 0, sizeof(stbuf));
	stbuf.st_ino = ino;
	stbuf.st_mode = mode;

	fuse_add_dirent(buf->str + last_size, name, &stbuf, buf->len);
}

static int js_reply_err(duk_context* ctx)
{
	Event* event = duk_require_pointer(ctx, 0);
	int err = duk_require_int(ctx, 1);

	fuse_reply_err(event->req, err);
	event_free(event);
	return 0;
}

static int js_reply_dir(duk_context* ctx)
{
	Event* event = duk_require_pointer(ctx, 0);

	GString* buf = g_string_sized_new(512);

	add_dirent(buf, ".", S_IFDIR, event->ino);
	add_dirent(buf, "..", S_IFDIR, event->ino);

	if (duk_is_array(ctx, 1)) {
		duk_enum(ctx, 1, 0);
		while (duk_next(ctx, -1, 1)) {
			if (duk_is_object(ctx, -1)) {
				const gchar* name = js_get_object_string(ctx, -1, "name");
				const gchar* type = js_get_object_string(ctx, -1, "type");
				ino_t ino = js_get_object_uint64(ctx, -1, "ino");

				if (name) {
					add_dirent(buf, name, type && g_str_equal(type, "dir") ? S_IFDIR : S_IFREG, ino);
				}
			}
			duk_pop_2(ctx);
		}
		duk_pop(ctx);
	}

	reply_buf_limited(event->req, buf->str, buf->len, event->off, event->size);
	g_string_free(buf, TRUE);
	event_free(event);
	return 0;
}

static int js_reply_attr(duk_context* ctx)
{
	Event* event = duk_require_pointer(ctx, 0);
	duk_to_object(ctx, 1);

	const gchar* type = js_get_object_string(ctx, 1, "type");
	guint64 size = js_get_object_uint64(ctx, 1, "size");

	const struct fuse_ctx* fc = fuse_req_ctx(event->req);
	struct stat stbuf;

	memset(&stbuf, 0, sizeof(stbuf));
	stbuf.st_uid = fc->uid;
	stbuf.st_gid = fc->gid;
	stbuf.st_ino = event->ino;

	if (type == NULL || g_str_equal(type, "file"))
		stbuf.st_mode = S_IFREG | 0644;
	else if (g_str_equal(type, "dir"))
		stbuf.st_mode = S_IFDIR | 0755;

	stbuf.st_nlink = 1;
	stbuf.st_size = size;
	
	fuse_reply_attr(event->req, &stbuf, 1.0);
	event_free(event);
	return 0;
}

static int js_reply_entry(duk_context* ctx)
{
	Event* event = duk_require_pointer(ctx, 0);
	duk_to_object(ctx, 1);

	const gchar* type = js_get_object_string(ctx, 1, "type");
	guint64 ino = js_get_object_uint64(ctx, 1, "ino");
	guint64 size = js_get_object_uint64(ctx, 1, "size");

	struct fuse_entry_param e;
	const struct fuse_ctx* fc = fuse_req_ctx(event->req);
	struct stat* stbuf = &e.attr;
	memset(&e, 0, sizeof(e));
                   
	stbuf->st_uid = fc->uid;
	stbuf->st_gid = fc->gid;
	stbuf->st_ino = ino;

	if (type == NULL || g_str_equal(type, "file"))
		stbuf->st_mode = S_IFREG | 0644;
	else if (g_str_equal(type, "dir"))
		stbuf->st_mode = S_IFDIR | 0755;

	stbuf->st_nlink = 1;
	stbuf->st_size = size;

	e.ino = ino;
	e.attr_timeout = 1.0;
	e.entry_timeout = 1.0;

	fuse_reply_entry(event->req, &e);
	event_free(event);
	return 0;
}

static int js_reply_open(duk_context* ctx)
{
	Event* event = duk_require_pointer(ctx, 0);

	fuse_reply_open(event->req, event->fi);
	event_free(event);
	return 0;
}

static int js_reply_buf(duk_context* ctx)
{
	duk_size_t size;
	Event* event = duk_require_pointer(ctx, 0);
	void* buf = duk_require_buffer(ctx, 1, &size);

	fuse_reply_buf(event->req, buf, size);
	event_free(event);
	return 0;
}

static const duk_function_list_entry fuse_methods[] = 
{
	{ "reply_err", js_reply_err, 2 },
	{ "reply_attr", js_reply_attr, 2 },
	{ "reply_entry", js_reply_entry, 2 },
	{ "reply_dir", js_reply_dir, 2 },
	{ "reply_open", js_reply_open, 1 },
	{ "reply_buf", js_reply_buf, 2 },
	//{ "umount", js_umount, 0 },
	{ NULL, NULL, 0 }
};

// }}}
// {{{ fuse loop thread

static gpointer fuse_thread(Fuse* fs)
{
	fs->thread_pt = pthread_self();

	fuse_session_loop(fs->session);

	return NULL;
}

static void run_fuse_thread(int argc, char* argv[], Fuse* fs)
{
	struct fuse_args args = FUSE_ARGS_INIT(argc, argv);

	if (fuse_parse_cmdline(&args, &fs->mountpoint, NULL, NULL) == -1) {
		emit_error(fs, "args", "Can't parse fuse command line");
		fuse_opt_free_args(&args);
		return;
	}

	fs->chan = fuse_mount(fs->mountpoint, &args);
	if (!fs->chan) {
		emit_error(fs, "mount", "Can't mount %s", fs->mountpoint);
		fuse_opt_free_args(&args);
		return;
	}

	fs->session = fuse_lowlevel_new(&args, &fuse_ops, sizeof(fuse_ops), fs);
	if (!fs->session) {
		emit_error(fs, "session", "Can't create fuse session");
		fuse_opt_free_args(&args);
		return;
	}

	fuse_session_add_chan(fs->session, fs->chan);

	fs->thread = g_thread_new("fuse thread", (GThreadFunc)fuse_thread, fs);
}

// }}}
// {{{ js_fuse

static int js_fuse(duk_context* ctx)
{
	duk_to_object(ctx, 0); // config object

	if (!duk_is_array(ctx, 1)) // args array
		return DUK_ERR_API_ERROR;

	// get argc/argv from args (second) parameter
	duk_size_t i = 1, argc = duk_get_length(ctx, 1);
	gchar** argv = g_new0(gchar*, argc + 2);
	argv[0] = g_strdup("megatools");
	duk_enum(ctx, 1, 0);
	while (duk_next(ctx, -1, 1)) {
		if (duk_is_string(ctx, -1))
			argv[i++] = g_strdup(duk_get_string(ctx, -1));
		duk_pop_2(ctx);
	}
	duk_pop(ctx);

	// create fuse object
	duk_push_object(ctx);

	// add callbacks from the config object
	if (js_get_object_function(ctx, 0, "getattr"))
		duk_put_prop_string(ctx, -2, "getattr");
	if (js_get_object_function(ctx, 0, "lookup"))
		duk_put_prop_string(ctx, -2, "lookup");
	if (js_get_object_function(ctx, 0, "readdir"))
		duk_put_prop_string(ctx, -2, "readdir");
	if (js_get_object_function(ctx, 0, "read"))
		duk_put_prop_string(ctx, -2, "read");
	if (js_get_object_function(ctx, 0, "open"))
		duk_put_prop_string(ctx, -2, "open");
	if (js_get_object_function(ctx, 0, "error"))
		duk_put_prop_string(ctx, -2, "error");

	// register fuse object methods
	duk_put_function_list(ctx, -1, fuse_methods);

	// register error codes
#define DEFINE_ERROR(name) \
	duk_push_int(ctx, name); \
	duk_put_prop_string(ctx, -2, #name);

	DEFINE_ERROR(EEXIST)
	DEFINE_ERROR(ENOENT)
	DEFINE_ERROR(ENOTDIR)
	DEFINE_ERROR(EISDIR)
	DEFINE_ERROR(EACCES)

	// take ref and run fuse thread
	Fuse* fs = g_new0(Fuse, 1);
	fs->ref = js_ref_take(ctx);
	fs_list = g_slist_prepend(fs_list, fs);
	run_fuse_thread(i, argv, fs);
	return 1;
}

// }}}
// {{{ js_fuse_init

static const duk_function_list_entry module_funcs[] = 
{
	{ "fuse", js_fuse, 2 },
	{ NULL, NULL, 0 }
};

void js_fuse_init(duk_context* ctx)
{
	duk_put_function_list(ctx, -1, module_funcs);
}

// }}}
// {{{ js_fuse_cleanup

void js_fuse_cleanup(void)
{
	g_slist_free_full(fs_list, (GDestroyNotify)fuse_free);
	fs_list = NULL;
}

// }}}

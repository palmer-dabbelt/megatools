#include <glib.h>

#ifdef G_OS_WIN32
#include <windows.h>
#else
#include <termios.h>
#include <unistd.h>
#endif

#include "js-misc.h"
#include "js.h"
#include "main.h"
#include "sjson.h"
#include "alloc.h"

static int js_joinbuf(duk_context* ctx)
{
	duk_idx_t i, nargs = duk_get_top(ctx);
	duk_size_t size, total_size = 0, off = 0;
	guchar *buf, *out_buf;

	for (i = 0; i < nargs; i++) {
		buf = duk_require_buffer(ctx, i, &size);
		total_size += size;
	}

	out_buf = duk_push_fixed_buffer(ctx, total_size);

	for (i = 0; i < nargs; i++) {
		buf = duk_require_buffer(ctx, i, &size);
		memcpy(out_buf + off, buf, size);
		off += size;
	}

	return 1;
}

static int js_slicebuf(duk_context* ctx)
{
	duk_size_t size;
	guchar *buf = duk_require_buffer(ctx, 0, &size);
	duk_uint_t off = duk_require_uint(ctx, 1);
	duk_uint_t len = duk_get_uint(ctx, 2);

	if (off > size) {
		duk_push_fixed_buffer(ctx, 0);
		return 1;
	}

	len = (len > 0 && off + len <= size) ? len : size - off;
	guchar* out_buf = duk_push_fixed_buffer(ctx, len);
	memcpy(out_buf, buf + off, len);
	return 1;
}

static gboolean js_timeout_callback(JsRef* ref)
{
	duk_context* ctx = js_ref_push(ref);

	if (js_get_object_function(ctx, -1, "callback")) {
		duk_dup(ctx, -2);

		if (duk_pcall_method(ctx, 0))
			js_handle_exception(ctx, "[timeout]");
	}

	duk_pop(ctx);

	js_ref_drop(ref);
	return FALSE;
}

static int js_timeout(duk_context* ctx)
{
	guint timeout = duk_require_uint(ctx, 1);
	if (!duk_is_function(ctx, 0))
		duk_error(ctx, DUK_ERR_API_ERROR, "You must provide callback to C.timeout");

	duk_push_object(ctx);
	duk_dup(ctx, 0);
	duk_put_prop_string(ctx, -2, "callback");

	JsRef* ref = js_ref_take(ctx);
	g_timeout_add(timeout, (GSourceFunc)js_timeout_callback, ref);

	return 1;
}

static gchar* tool_convert_filename(const gchar* path, gboolean local)
{
	gchar* locale_path;

#ifdef G_OS_WIN32
	locale_path = g_locale_to_utf8(path, -1, NULL, NULL, NULL);
#else
	if (local)
		locale_path = g_strdup(path);
	else
		locale_path = g_locale_to_utf8(path, -1, NULL, NULL, NULL);
#endif

	if (locale_path == NULL) {
		g_printerr("ERROR: Invalid filename locale, can't convert file names specified on the command line to UTF-8.\n");
		exit(1);
	}

	return locale_path;
}

static gchar* prompt(const gchar* message, gboolean no_echo)
{
	gchar buf[256];
	gchar* input = NULL;

#ifdef G_OS_WIN32
	HANDLE hStdin = GetStdHandle(STD_INPUT_HANDLE); 
	DWORD mode = 0;
	GetConsoleMode(hStdin, &mode);

	if (no_echo) {
		SetConsoleMode(hStdin, mode & (~ENABLE_ECHO_INPUT));
	}
#else
	struct termios oldt;
	tcgetattr(STDIN_FILENO, &oldt);

	if (no_echo) {
		struct termios newt = oldt;
		newt.c_lflag &= ~ECHO;
		tcsetattr(STDIN_FILENO, TCSANOW, &newt);
	}
#endif

	g_print("%s", message);
	if (fgets(buf, 256, stdin)) {
		input = g_strndup(buf, strcspn(buf, "\r\n"));
	} else {
		return NULL;
	}

	if (no_echo) {
#ifdef G_OS_WIN32
		SetConsoleMode(hStdin, mode);
#else
		tcsetattr(STDIN_FILENO, TCSANOW, &oldt);
#endif
	}

	return input;
}

typedef struct {
	JsRef* ref;
	gchar* message;
	gchar* input;
	gboolean silent;
} PromptData;

static void prompt_data_free(PromptData* data)
{
	js_ref_drop(data->ref);
	g_free(data->message);
	g_free(data->input);
	g_free(data);
}

static gboolean js_prompt_callback(PromptData* data)
{
	duk_context* ctx = js_ref_push(data->ref);

	if (js_get_object_function(ctx, -1, "callback")) {
		duk_dup(ctx, -2);

		if (data->input)
			duk_push_string(ctx, data->input);
		else
			duk_push_undefined(ctx);

		if (duk_pcall_method(ctx, 1))
			js_handle_exception(ctx, "[prompt]");
	}

	duk_pop(ctx);

	prompt_data_free(data);
	return FALSE;
}

static gpointer prompt_thread(PromptData* data)
{
	data->input = prompt(data->message, data->silent);

	g_idle_add((GSourceFunc)js_prompt_callback, data);

	return NULL;
}

static int js_prompt(duk_context *ctx)
{
	const gchar* message = duk_require_string(ctx, 0);
	if (!duk_is_function(ctx, 1))
		duk_error(ctx, DUK_ERR_API_ERROR, "You must provide callback to C.prompt");
	gboolean silent = duk_get_boolean(ctx, 2);

	duk_push_object(ctx);
	duk_dup(ctx, 1);
	duk_put_prop_string(ctx, -2, "callback");

	PromptData* data = g_new0(PromptData, 1);
	data->ref = js_ref_take(ctx);
	data->message = g_strdup(message);
	data->silent = silent;

	GThread* thread = g_thread_new("prompt thread", (GThreadFunc)prompt_thread, data);
	g_thread_unref(thread);

	return 1;
}

static int js_file_read(duk_context *ctx)
{
	const gchar* path = duk_require_string(ctx, 0);

	gchar* data;
	gsize size;

	if (!g_file_get_contents(path, &data, &size, NULL))
		return 0;

	gchar* buf = duk_push_fixed_buffer(ctx, size);
	memcpy(buf, data, size);
	return 1;
}

static int js_file_write(duk_context *ctx)
{
	const gchar* path = duk_require_string(ctx, 0);
	duk_size_t len;
	const gchar* buf = duk_require_buffer(ctx, 1, &len);

	duk_push_boolean(ctx, g_file_set_contents(path, buf, len, NULL));
	return 1;
}

static int js_file_exists(duk_context *ctx)
{
	const gchar* path = duk_require_string(ctx, 0);

	gboolean exists = g_file_test(path, G_FILE_TEST_EXISTS | G_FILE_TEST_IS_REGULAR | G_FILE_TEST_IS_SYMLINK);
	duk_push_boolean(ctx, exists);
	return 1;
}

static int js_sha256_digest(duk_context *ctx)
{
	duk_size_t len;
	const gchar* buf = duk_require_buffer(ctx, 0, &len);
	GChecksum* sum = g_checksum_new(G_CHECKSUM_SHA256);
	g_checksum_update(sum, buf, len);
	gsize dlen = g_checksum_type_get_length(G_CHECKSUM_SHA256);
	gchar* sum_buf = duk_push_fixed_buffer(ctx, dlen);
	g_checksum_get_digest(sum, sum_buf, &dlen);
	g_checksum_free(sum);
	return 1;
}

static int js_get_tmp_dir(duk_context *ctx)
{
	duk_push_string(ctx, g_get_tmp_dir());
	return 1;
}

static int js_get_current_dir(duk_context *ctx)
{
	duk_push_string(ctx, g_get_current_dir());
	return 1;
}

static int js_get_home_dir(duk_context *ctx)
{
	duk_push_string(ctx, g_get_home_dir());
	return 1;
}

static int js_get_config_dir(duk_context *ctx)
{
	duk_push_string(ctx, g_get_user_config_dir());
	return 1;
}

#define DW(p, n) (*((guint32*)(p) + (n)))

static void unpack_node_key(const guchar node_key[32], guchar aes_key[16], guchar nonce[8], guchar meta_mac_xor[8])
{
	if (aes_key) {
		DW(aes_key, 0) = DW(node_key, 0) ^ DW(node_key, 4);
		DW(aes_key, 1) = DW(node_key, 1) ^ DW(node_key, 5);
		DW(aes_key, 2) = DW(node_key, 2) ^ DW(node_key, 6);
		DW(aes_key, 3) = DW(node_key, 3) ^ DW(node_key, 7);
	}

	if (nonce) {
		DW(nonce, 0) = DW(node_key, 4);
		DW(nonce, 1) = DW(node_key, 5);
	}

	if (meta_mac_xor) {
		DW(meta_mac_xor, 0) = DW(node_key, 6);
		DW(meta_mac_xor, 1) = DW(node_key, 7);
	}
}

static void pack_node_key(guchar node_key[32], guchar aes_key[16], guchar nonce[8], guchar meta_mac[16])
{
	DW(node_key, 0) = DW(aes_key, 0) ^ DW(nonce, 0);
	DW(node_key, 1) = DW(aes_key, 1) ^ DW(nonce, 1);
	DW(node_key, 2) = DW(aes_key, 2) ^ DW(meta_mac, 0) ^ DW(meta_mac, 1);
	DW(node_key, 3) = DW(aes_key, 3) ^ DW(meta_mac, 2) ^ DW(meta_mac, 3);
	DW(node_key, 4) = DW(nonce, 0);
	DW(node_key, 5) = DW(nonce, 1);
	DW(node_key, 6) = DW(meta_mac, 0) ^ DW(meta_mac, 1);
	DW(node_key, 7) = DW(meta_mac, 2) ^ DW(meta_mac, 3);
}

static int js_file_node_key_unpack(duk_context *ctx)
{
	duk_size_t len;
	const guchar* buf = duk_require_buffer(ctx, 0, &len);

        if (len != 32)
		duk_error(ctx, DUK_ERR_API_ERROR, "Node key size must be 32");

	guchar* key = duk_push_fixed_buffer(ctx, 16);
	unpack_node_key(buf, key, NULL, NULL);
	return 1;
}

static int js_buftojsonstring(duk_context *ctx)
{
	duk_size_t len;
	const guchar* buf = duk_require_buffer(ctx, 0, &len);
	gc_free gchar* tmp = g_strndup(buf, len);
	gc_free gchar* tmp2 = s_json_get(tmp);

	if (tmp2)
		duk_push_string(ctx, tmp2);
	else
		duk_push_undefined(ctx);

	return 1;
}

static const duk_function_list_entry module_funcs[] = 
{
	{ "timeout", js_timeout, 2 },
	{ "joinbuf", js_joinbuf, DUK_VARARGS },
	{ "slicebuf", js_slicebuf, 3 },
	{ "prompt", js_prompt, 3 },
	{ "file_read", js_file_read, 1 },
	{ "file_write", js_file_write, 2 },
	{ "file_exists", js_file_exists, 1 },
	{ "sha256_digest", js_sha256_digest, 1 },
	{ "get_tmp_dir", js_get_tmp_dir, 0 },
	{ "get_current_dir", js_get_current_dir, 0 },
	{ "get_home_dir", js_get_home_dir, 0 },
	{ "get_config_dir", js_get_config_dir, 0 },
	{ "file_node_key_unpack", js_file_node_key_unpack, 1 },
	{ "buftojsonstring", js_buftojsonstring, 1 },
	{ NULL, NULL, 0 }
};

void js_misc_init(duk_context* ctx)
{
	duk_put_function_list(ctx, -1, module_funcs);
}

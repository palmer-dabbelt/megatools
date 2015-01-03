#include <string.h>
#include <stdio.h>
#include <glib.h>
#include <locale.h>
#ifdef G_OS_WIN32
#include <windows.h>
#else
#include <signal.h>
#include <termios.h>
#include <unistd.h>
#endif
#include "config.h"
#include "alloc.h"
#include "duktape.h"
#include "http.h"
#include "js.h"
#include "js-misc.h"
#include "js-http.h"
#include "js-crypto.h"
#include "js-fuse.h"
#include "main.h"

static GMainLoop* loop;
static duk_context* ctx;
static gint exit_code = 1;

void js_handle_exception(duk_context* ctx, const gchar* loc)
{
	duk_get_prop_string(ctx, -1, "stack");
	g_printerr("\nFATAL ERROR:\n%s: %s\n\n", loc, duk_safe_to_string(ctx, -1));
	g_main_loop_quit(loop);
}

static int js_exit(duk_context *ctx) 
{
	exit_code = duk_get_int(ctx, 0);
	g_main_loop_quit(loop);
	return 0;
}

static const duk_function_list_entry main_funcs[] = 
{
	{ "exit", js_exit, 1 },
	{ NULL, NULL, 0 }
};

static duk_context* js_init(int argc, char* argv[])
{
	gint i;
	duk_context* ctx = duk_create_heap_default();

	duk_push_global_object(ctx);
	duk_push_object(ctx);

	// C.*
	duk_put_function_list(ctx, -1, main_funcs);
	js_fuse_init(ctx);
	js_crypto_init(ctx);
	js_http_init(ctx);
	js_misc_init(ctx);

	// C.args
	duk_push_array(ctx);
	for (i = 0; i < argc; i++) {
		duk_push_string(ctx, argv[i]);
		duk_put_prop_index(ctx, -2, i);
	}
	duk_put_prop_string(ctx, -2, "args");

	// C.os
#ifdef G_OS_WIN32
	duk_push_string(ctx, "windows");
#else
	duk_push_string(ctx, "unix");
#endif
	duk_put_prop_string(ctx, -2, "os");

	// C.version
	duk_push_string(ctx, VERSION);
	duk_put_prop_string(ctx, -2, "version");

	// C
	duk_put_prop_string(ctx, -2, "C");
	duk_pop(ctx);

	return ctx;
}

#define duk_peval_lstring_filename(ctx,buf,len,fn)  \
	((void) duk_push_string((ctx), fn), \
	 duk_eval_raw((ctx), buf, len, DUK_COMPILE_EVAL | DUK_COMPILE_NOSOURCE | DUK_COMPILE_SAFE))

static gboolean js_eval_resource(const gchar* path)
{
	gboolean status = FALSE;
	gc_bytes_unref GBytes* app = g_resources_lookup_data(path, 0, NULL);
	if (!app) {
		g_printerr("ERROR: Resource %s not found\n", path);
		return FALSE;
	}

	gsize size;
	gconstpointer data = g_bytes_get_data(app, &size);

	if (duk_peval_lstring_filename(ctx, data, size, path) != 0)
		js_handle_exception(ctx, path);
	else
		status = TRUE;

	duk_pop(ctx);

	return status;
}

static gboolean js_eval_dir(const gchar* path)
{
	gint i;
	gc_strfreev gchar** filenames = g_resources_enumerate_children(path, 0, NULL);
	if (!filenames)
		return TRUE;

	for (i = 0; i < g_strv_length(filenames); i++) {
		gc_free gchar* filepath = g_strconcat(path, "/", filenames[i], NULL);

		if (!js_eval_resource(filepath))
			return FALSE;
	}

	return TRUE;
}

#define EVAL(p) \
	if (!js_eval_resource(p)) { \
		g_main_loop_quit(loop); \
		return FALSE; \
	}

#define EVAL_DIR(p) \
	if (!js_eval_dir(p)) { \
		g_main_loop_quit(loop); \
		return FALSE; \
	}

static gboolean run(gpointer data)
{
	EVAL("/js/libs/underscore-min.js");
	EVAL("/js/libs/gw.js");
	EVAL("/js/debug.js");
	EVAL("/js/defer.js");
	EVAL("/js/utils.js");
	EVAL("/js/api.js");
	EVAL("/js/session.js");
	EVAL("/js/tool.js");
	EVAL("/js/test.js");
	EVAL_DIR("/js/tools");
	EVAL_DIR("/js/tests");
	EVAL("/js/main.js");

	return FALSE;
}

#ifdef G_OS_WIN32
static gchar* get_tools_dir(void)
{
	HMODULE handle = GetModuleHandleW(NULL);

	gc_free gchar* path = NULL;
	gc_free wchar_t *wpath = g_new0(wchar_t, PATH_MAX);
	if (GetModuleFileNameW(handle, wpath, PATH_MAX) < PATH_MAX)
		path = g_utf16_to_utf8(wpath, -1, NULL, NULL, NULL);

	if (path == NULL)
		path = g_strdup("");

	return = g_path_get_dirname(path);
}
#endif

static void on_sigint(int sig)
{
	g_main_loop_quit(loop);
}

static int set_one_signal_handler(int sig, void (*handler)(int))
{
	struct sigaction sa;
	struct sigaction old_sa;

	memset(&sa, 0, sizeof(struct sigaction));
	sa.sa_handler = handler;
	sigemptyset(&(sa.sa_mask));
	sa.sa_flags = 0;

	if (sigaction(sig, NULL, &old_sa) == -1) {
		perror("fuse: cannot get old signal handler");
		return -1;
	}

	if (old_sa.sa_handler == SIG_DFL && sigaction(sig, &sa, NULL) == -1) {
		perror("fuse: cannot set signal handler");
		return -1;
	}

	return 0;
}

int main(int argc, char* argv[])
{
#if !GLIB_CHECK_VERSION(2, 32, 0)
	if (!g_thread_supported())
		g_thread_init(NULL);
#endif

	setlocale(LC_ALL, "");

#if !GLIB_CHECK_VERSION(2, 36, 0)
	g_type_init();
#endif

#ifdef G_OS_WIN32
	gc_free gchar* tools_dir = get_tools_dir();
	gc_free gchar* tmp = g_build_filename(tools_dir, "gio", NULL);
	g_setenv("GIO_EXTRA_MODULES", tmp, TRUE);
	gc_free gchar* certs = g_build_filename(tools_dir, "ca-certificates.crt", NULL);
	g_setenv("CA_CERT_PATH", certs, TRUE);
#endif

#ifndef G_OS_WIN32
	set_one_signal_handler(SIGPIPE, SIG_IGN);
	set_one_signal_handler(SIGINT, on_sigint);
	set_one_signal_handler(SIGTERM, on_sigint);
#endif

	http_init();
	loop = g_main_loop_new(NULL, TRUE);

	ctx = js_init(argc, argv);
	g_idle_add(run, NULL);
	g_main_loop_run(loop);

#ifndef G_OS_WIN32
	set_one_signal_handler(SIGINT, SIG_DFL);
	set_one_signal_handler(SIGTERM, SIG_DFL);
#endif

	http_cleanup();
	js_fuse_cleanup();
	duk_destroy_heap(ctx);
	g_main_loop_unref(loop);

	return exit_code;
}

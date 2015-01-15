#include "js-http.h"
#include "js.h"
#include "http.h"
#include "main.h"

static const gchar* get_http_callback_name(HttpRequestEventType type)
{
	switch (type) {
		case HTTP_REQUEST_EVENT_ERROR: return "onerror";
		case HTTP_REQUEST_EVENT_COMPLETE: return "onload";
		case HTTP_REQUEST_EVENT_DATA: return "ondata";
		default: return NULL;
	}
}

static void event_callback(HttpRequest* request, HttpRequestEvent* event, JsRef* ref)
{
	const gchar* callback_name = get_http_callback_name(event->type);
	if (callback_name == NULL)
		return;

	duk_context* ctx = js_ref_push(ref);

	// get callback fn if available
	if (js_get_object_function(ctx, -1, callback_name)) {
		// push request object to call context
		duk_dup(ctx, -2);

		gint nargs = 0;
		if (event->type == HTTP_REQUEST_EVENT_ERROR) {
			// push error object argument
			duk_push_string(ctx, event->error_code);
			duk_push_string(ctx, event->error_message);
			nargs = 2;
		} else if (event->type == HTTP_REQUEST_EVENT_COMPLETE) {
			gsize body_size = 0;
			const guchar* body = http_request_get_response_body(request, &body_size);

			if (body) {
				guchar* buf = duk_push_fixed_buffer(ctx, body_size);
				memcpy(buf, body, body_size);
				nargs = 1;
			}

			js_ref_drop(ref);
		}

		// call callback fn
		if (duk_pcall_method(ctx, nargs))
			js_handle_exception(ctx, "[http event]");
	}

	// pop request object
	duk_pop(ctx);
}

static duk_ret_t my_finalizer(duk_context *ctx) {
	duk_get_prop_string(ctx, 0, "request");
	if (duk_is_pointer(ctx, -1)) {
		HttpRequest* r = duk_get_pointer(ctx, -1);

		http_request_unref(r);
	}

	return 0;
}

static int js_http(duk_context *ctx)
{
	duk_to_object(ctx, 0);
	duk_push_object(ctx);

	const gchar* method = js_get_object_string(ctx, -2, "method");
	const gchar* url = js_get_object_string(ctx, -2, "url");
	const gchar* data = js_get_object_string(ctx, -2, "data");

	if (!method)
		method = "GET";

	if (!data)
		data = "";

	if (!url)
		duk_error(ctx, DUK_ERR_API_ERROR, "You must provide URL for C.http");

	if (js_get_object_function(ctx, -2, "onload"))
		duk_put_prop_string(ctx, -2, "onload");

	if (js_get_object_function(ctx, -2, "onerror"))
		duk_put_prop_string(ctx, -2, "onerror");

	HttpRequest* request = http_request_new(method, url);
	http_request_set_data(request, data, -1);

	duk_push_pointer(ctx, request);
	duk_put_prop_string(ctx, -2, "request");

	duk_push_c_function(ctx, my_finalizer, 1);
	duk_set_finalizer(ctx, -2);

	// take reference of a JS object that will be passed to the callbacks
	JsRef* ref = js_ref_take(ctx);

	http_request_set_event_callback(request, (HttpRequestEventCallbackFunc)event_callback, ref);
	http_queue_request(request);

	return 1;
}

static const duk_function_list_entry module_funcs[] = 
{
	{ "http", js_http, 1 },
	{ NULL, NULL, 0 }
};

void js_http_init(duk_context* ctx)
{
	duk_put_function_list(ctx, -1, module_funcs);
}

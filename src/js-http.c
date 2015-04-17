#include "js-http.h"
#include "js.h"
#include "http.h"
#include "main.h"

typedef struct {
	JsRef* ref;
	HttpRequest* request;
} HttpData;

static void http_data_free(HttpData* data)
{
	g_clear_pointer(&data->request, http_request_unref);
}

static void event_callback(HttpRequest* request, HttpRequestEvent* event, HttpData* data)
{
	const gchar* callback_name = NULL;

	switch (event->type) {
		case HTTP_REQUEST_EVENT_ERROR:	       callback_name = "onerror";        break; 
		case HTTP_REQUEST_EVENT_COMPLETE:      callback_name = "onload";         break;
		case HTTP_REQUEST_EVENT_PULL_BODY:     callback_name = "onpullbody";     break;
		case HTTP_REQUEST_EVENT_RECV_HEADERS:  callback_name = "onrecvheaders";  break;
		case HTTP_REQUEST_EVENT_RECV_BODY:     callback_name = "onrecvbody";     break;
		default: return;
	}

	duk_context* ctx = js_ref_push(data->ref);

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

			js_ref_drop(data->ref);
		} else if (event->type == HTTP_REQUEST_EVENT_PULL_BODY) {
			// no argumnets
		} else if (event->type == HTTP_REQUEST_EVENT_RECV_HEADERS) {
			// no argumnets
		} else if (event->type == HTTP_REQUEST_EVENT_RECV_BODY) {
			js_push_gbytes(ctx, event->data);
			nargs = 1;
		} else if (event->type == HTTP_REQUEST_EVENT_COMPLETE) {
			// push response body if request is not set to ondemand
			if (!http_request_is_incremental(request)) {
				gsize body_size = 0;
				const guchar* body = http_request_get_response_body(request, &body_size);

				if (body) {
					guchar* buf = duk_push_fixed_buffer(ctx, body_size);
					memcpy(buf, body, body_size);
					nargs = 1;
				}
			}

			js_ref_drop(data->ref);
		}

		// call callback fn
		if (duk_pcall_method(ctx, nargs))
			js_handle_exception(ctx, "[http event]");

                duk_pop(ctx);
	}

	// pop request object
	duk_pop(ctx);
}

static duk_ret_t push_body(duk_context *ctx) {
	HttpData* data = js_c_object_this(ctx, "http");

	duk_size_t size;
	gchar* buf = duk_require_buffer(ctx, 0, &size);

	http_request_push_body(data->request, buf, size);
	return 0;
}

static duk_ret_t next(duk_context *ctx) {
	HttpData* data = js_c_object_this(ctx, "http");

	http_request_continue(data->request);
	return 0;
}

static const duk_function_list_entry http_methods[] = 
{
	{ "push_body", push_body, 1 },
	{ "next", next, 0 },
	{ NULL, NULL, 0 }
};

static int js_http(duk_context *ctx)
{
	duk_to_object(ctx, 0);

	const gchar* method = js_get_object_string(ctx, 0, "method");
	const gchar* url = js_get_object_string(ctx, 0, "url");
	const gchar* body = js_get_object_string(ctx, 0, "data");
	gboolean incremental = js_get_object_boolean(ctx, 0, "incremental");

	if (!method)
		method = "GET";

	if (!body)
		body = "";

	if (!url)
		duk_error(ctx, DUK_ERR_API_ERROR, "You must provide URL for C.http");

	HttpRequest* request = http_request_new(method, url, incremental);

	if (!incremental) {
		http_request_set_body(request, body, -1);
	}

	// setup headers
	duk_get_prop_string(ctx, 0, "headers");
	if (duk_is_object(ctx, -1)) {
		duk_enum(ctx, -1, DUK_ENUM_OWN_PROPERTIES_ONLY);
		while (duk_next(ctx, -1 , 1)) {
			const gchar* key = duk_get_string(ctx, -2);
			const gchar* val = duk_to_string(ctx, -1);

			if (key && val) {
				http_request_set_header(request, key, val);
			}

			duk_pop_2(ctx);
		}
		duk_pop(ctx);
	}
	duk_pop(ctx);

	// setup http instance
	HttpData* data = js_c_object_new(ctx, "http");
	data->ref = js_ref_take(ctx);
	data->request = request;

	// copy callbacks to the http object
	if (js_get_object_function(ctx, 0, "onrecvheaders"))
		duk_put_prop_string(ctx, -2, "onrecvheaders");

	if (js_get_object_function(ctx, 0, "onrecvbody"))
		duk_put_prop_string(ctx, -2, "onrecvbody");

	if (js_get_object_function(ctx, 0, "onpullbody"))
		duk_put_prop_string(ctx, -2, "onpullbody");

	if (js_get_object_function(ctx, 0, "onload"))
		duk_put_prop_string(ctx, -2, "onload");

	if (js_get_object_function(ctx, 0, "onerror"))
		duk_put_prop_string(ctx, -2, "onerror");

	http_request_set_event_callback(request, (HttpRequestEventCallbackFunc)event_callback, data);
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

	js_c_class_create(ctx, "http", sizeof(HttpData), (GDestroyNotify)http_data_free);
	duk_put_function_list(ctx, -1, http_methods);
	duk_pop(ctx);
}

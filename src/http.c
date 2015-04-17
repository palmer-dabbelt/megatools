#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <gio/gio.h>
#include "http.h"
#include "alloc.h"
#include <gnutls/gnutls.h>

#define D_BIT(n)                    (1u << n)
#define D_NONE                      0
#define D_THREADS                   D_BIT(0)
#define D_THREAD_MESSAGES           D_BIT(1)
#define D_THREAD_MEM                D_BIT(2)
#define D_EVENTS                    D_BIT(3)
#define D_COMMANDS                  D_BIT(4)
#define D_HTTP                      D_BIT(5)
#define D_HTTP_MEM                  D_BIT(6)
#define D_HTTP_BODY                 D_BIT(7)
#define D_HTTP_HEADERS              D_BIT(8)
#define D_HTTP_PROGRESS             D_BIT(9)
#define D_ENABLE                    D_NONE
#define D(bit, msg, args...)        G_STMT_START { if (bit & (D_ENABLE)) g_printerr(msg, ##args); } G_STMT_END

DEFINE_CLEANUP_FUNCTION_NULL(HttpRequest*, http_request_unref)
#define gc_http_request_unref CLEANUP(http_request_unref)

// {{{ stri_equal

static gboolean stri_equal(gconstpointer v1, gconstpointer v2) 
{
	const gchar *string1 = v1;
	const gchar *string2 = v2;

	return g_ascii_strcasecmp (string1, string2) == 0;
}

// }}}
// {{{ stri_hash

static guint stri_hash(gconstpointer v)
{
	const signed char *p;
	guint32 h = 5381;

	for (p = v; *p != '\0'; p++)
		h = (h << 5) + h + g_ascii_tolower(*p);

	return h;
}

// }}}
// {{{ parse_url

G_LOCK_DEFINE_STATIC(parse_url_regex);
static GRegex* regex_url;

static gboolean parse_url(const gchar* url, gboolean* https, gchar** host, guint16* port, gchar** resource)
{
	GMatchInfo *match_info = NULL;
	gchar* schema = NULL;
	gchar* port_str = NULL;
	gboolean status = FALSE;

	g_return_val_if_fail(url != NULL, FALSE);
	g_return_val_if_fail(https != NULL, FALSE);
	g_return_val_if_fail(host != NULL, FALSE);
	g_return_val_if_fail(port != NULL, FALSE);
	g_return_val_if_fail(resource != NULL, FALSE);

	G_LOCK(parse_url_regex);
	if (!regex_url) {
		regex_url = g_regex_new("^([a-z]+)://([a-z0-9.-]+(?::([0-9]+))?)(/.+)?$", G_REGEX_CASELESS, 0, NULL);
	}
	G_UNLOCK(parse_url_regex);

	if (!g_regex_match(regex_url, url, 0, &match_info))
		goto out;

	// check schema
	schema = g_match_info_fetch(match_info, 1);
	if (!g_ascii_strcasecmp("http", schema)) {
		*port = 80;
		*https = FALSE;
	} else if (!g_ascii_strcasecmp("https", schema)) {
		*port = 443;
		*https = TRUE;
	} else
		goto out;

	*host = g_match_info_fetch(match_info, 2);

	port_str = g_match_info_fetch(match_info, 3);
	if (port_str) {
		if (*port_str)
			*port = atoi(port_str);
		g_free(port_str);
	}

	*resource = g_match_info_fetch(match_info, 4);
	if (*resource == NULL)
		*resource = g_strdup("/");

	status = TRUE;
out:
	g_free(schema);
	g_match_info_free(match_info);
	return status;
}

// }}}

// Request:

struct _HttpRequest {
	gint ref_count;

	gboolean invalid;

	gchar* url;
	gchar* host;
	guint16 port;
	gboolean secure;
	gchar* resource;
	gchar* method;

	GHashTable* request_headers;
	guchar* request_body;
        gsize request_body_size;

	GHashTable* response_headers;
	guchar* response_body;
        gsize response_body_size;

	HttpRequestEventCallbackFunc callback;
	gpointer callback_data;

	gboolean queued;

	gboolean incremental;
	GAsyncQueue* commands_queue;
};

// Request commands:

// {{{ Command

typedef enum {
	COMMAND_TYPE_NONE,
	COMMAND_TYPE_CONTINUE,
	COMMAND_TYPE_PUSH_BODY
} CommandType;

typedef struct {
	HttpRequest* request;
	CommandType type;
	GBytes* data;
} Command;

static Command* command_new(HttpRequest* request, CommandType type)
{
	g_return_val_if_fail(request != NULL, NULL);

	Command* c = g_slice_new0(Command);

	c->request = http_request_ref(request);
	c->type = type;

	return c;
}

static void command_free(Command* command)
{
	if (command) {
		http_request_unref(command->request);
		g_clear_pointer(&command->data, g_bytes_unref);

		memset(command, 0, sizeof(Command));
		g_slice_free(Command, command);
	}
}

static void command_queue(Command* command)
{
	g_return_if_fail(command != NULL);

	g_async_queue_push(command->request->commands_queue, command);
}

DEFINE_CLEANUP_FUNCTION_NULL(Command*, command_free)
#define gc_command_free CLEANUP(command_free)

// }}}
// {{{ http_request_wait_for_command

static Command* http_request_wait_for_command(HttpRequest* request)
{
	g_return_if_fail(request != NULL);

	return g_async_queue_timeout_pop(request->commands_queue, 60 * 1000000);
}

// }}}

// Request API:

// {{{ http_request_new

HttpRequest* http_request_new(const gchar* method, const gchar* url, gboolean incremental)
{
	g_return_val_if_fail(method != NULL, NULL);
	g_return_val_if_fail(url != NULL, NULL);

	HttpRequest* r = g_new0(HttpRequest, 1);

	r->ref_count = 1;
	r->method = g_strdup(method);
	r->url = g_strdup(url);
	r->request_headers = g_hash_table_new_full(stri_hash, stri_equal, g_free, g_free);
	r->response_headers = g_hash_table_new_full(stri_hash, stri_equal, g_free, g_free);
	r->incremental = incremental;
	r->commands_queue = g_async_queue_new_full((GDestroyNotify)command_free);

	if (!parse_url(r->url, &r->secure, &r->host, &r->port, &r->resource)) {
		r->invalid = TRUE;
	}

	D(D_HTTP_MEM, "NEW REQUEST %p\n", r);

	return r;
}

// }}}
// {{{ http_request_set_header

void http_request_set_header(HttpRequest* request, const gchar* name, const gchar* value)
{
	g_return_if_fail(request != NULL);
	g_return_if_fail(name != NULL);
	g_return_if_fail(value != NULL);

	g_hash_table_insert(request->request_headers, g_strdup(name), g_strdup(value));
}

// }}}
// {{{ http_request_set_body

void http_request_set_body(HttpRequest* request, const gchar* data, gssize len)
{
	g_return_if_fail(request != NULL);
	g_return_if_fail(data != NULL);

	g_clear_pointer(&request->request_body, g_free);

	request->request_body_size = len < 0 ? strlen(data) : len;
	request->request_body = g_memdup(data, request->request_body_size);
}

// }}}
// {{{ http_request_set_event_callback

void http_request_set_event_callback(HttpRequest* request, HttpRequestEventCallbackFunc cb, gpointer user_data)
{
	g_return_if_fail(request != NULL);

	request->callback = cb;
	request->callback_data = user_data;
}

// }}}
// {{{ http_request_get_response_header

const gchar* http_request_get_response_header(HttpRequest* request, const gchar* name)
{
	g_return_val_if_fail(request != NULL, NULL);

	return g_hash_table_lookup(request->response_headers, name);
}

// }}}
// {{{ http_request_get_response_body

const guchar* http_request_get_response_body(HttpRequest* request, gsize* len)
{
	g_return_val_if_fail(request != NULL, NULL);

	if (len)
		*len = request->response_body_size;

	return request->response_body;
}

// }}}
// {{{ http_request_is_incremental

gboolean http_request_is_incremental(HttpRequest* request)
{
	g_return_val_if_fail(request != NULL, FALSE);
	
	return request->incremental;
}

// }}}
// {{{ http_request_push_body

void http_request_push_body(HttpRequest* request, const gchar* data, gssize len)
{
	g_return_if_fail(request != NULL);
	g_return_if_fail(data != NULL);
	g_return_if_fail(len > 0);

	Command* c = command_new(request, COMMAND_TYPE_PUSH_BODY);
	c->data = g_bytes_new(data, len);

	D(D_COMMANDS, "-> COMMAND: PUSH BODY\n");

	if (c) {
		command_queue(c);
	}
}

// }}}
// {{{ http_request_continue

void http_request_continue(HttpRequest* request)
{
	g_return_if_fail(request != NULL);

	Command* c = command_new(request, COMMAND_TYPE_CONTINUE);

	D(D_COMMANDS, "-> COMMAND: CONTINUE\n");

	if (c) {
		command_queue(c);
	}
}

// }}}
// {{{ http_request_ref

HttpRequest* http_request_ref(HttpRequest* request)
{
	g_return_val_if_fail(request != NULL, NULL);

	g_atomic_int_inc(&request->ref_count);

	return request;
}

// }}}
// {{{ http_request_unref

void http_request_unref(HttpRequest* request)
{
	g_return_if_fail(request != NULL);

	if (g_atomic_int_dec_and_test(&request->ref_count)) {
		D(D_HTTP_MEM, "FREE REQUEST %p\n", request);
		g_free(request->url);
		g_free(request->method);
		g_free(request->host);
		g_free(request->resource);
		g_free(request->request_body);
		g_free(request->response_body);
		g_hash_table_unref(request->request_headers);
		g_hash_table_unref(request->response_headers);
		g_async_queue_unref(request->commands_queue);
		g_free(request);
	}
}

// }}}

// Request events:

// {{{ Event

typedef struct {
	HttpRequest* request;
	HttpRequestEvent event;
} Event;

static Event* event_new(HttpRequest* request, HttpRequestEventType type)
{
	g_return_val_if_fail(request != NULL, NULL);

	Event* e = g_slice_new0(Event);

	e->request = http_request_ref(request);
	e->event.type = type;

	return e;
}

static void event_free(Event* event)
{
	if (event) {
		http_request_unref(event->request);

		// clear event payload
		if (event->event.type == HTTP_REQUEST_EVENT_ERROR) {
			g_clear_pointer(&event->event.error_code, g_free);
			g_clear_pointer(&event->event.error_message, g_free);
		}

		if (event->event.type == HTTP_REQUEST_EVENT_RECV_BODY) {
			g_clear_pointer(&event->event.data, g_bytes_unref);
		}

		memset(event, 0, sizeof(Event));
		g_slice_free(Event, event);
	}
}

static gboolean emit_callback_idle(Event* event)
{
	g_return_val_if_fail(event != NULL, FALSE);

	if (event->request->callback)
		event->request->callback(event->request, &event->event, event->request->callback_data);

	event_free(event);
	return FALSE;
}

static void event_queue(Event* event)
{
	g_return_if_fail(event != NULL);

	g_idle_add((GSourceFunc)emit_callback_idle, event);
}

// }}}
// {{{ emit_error_full

static void emit_error_full(HttpRequest* request, const gchar* code, const gchar* message)
{
	Event* e = event_new(request, HTTP_REQUEST_EVENT_ERROR);

	D(D_EVENTS, "<- ERROR %s %s\n", code, message);

	if (e) {
		e->event.error_code = g_strdup(code);
		e->event.error_message = g_strdup(message);

		event_queue(e);
	}
}

// }}}
// {{{ emit_error

static void emit_error(HttpRequest* request, const gchar* code, const gchar* format, ...)
{
	va_list args;
	va_start(args, format);
	gc_free gchar* message = g_strdup_vprintf(format, args);
	va_end(args);

	emit_error_full(request, code, message);
}

// }}}
// {{{ emit_error_propagate

static void emit_error_propagate(HttpRequest* request, GError* error, const gchar* code, const gchar* format, ...)
{
	va_list args;
	va_start(args, format);
	gc_free gchar* message_base = g_strdup_vprintf(format, args);
	va_end(args);

	gc_free gchar* message = g_strconcat(message_base, error ? error->message : "", NULL);

	emit_error_full(request, code, message);
}

// }}}
// {{{ emit_complete

static void emit_complete(HttpRequest* request)
{
	Event* e = event_new(request, HTTP_REQUEST_EVENT_COMPLETE);

	D(D_EVENTS, "<- COMPLETE\n");

	if (e) {
		event_queue(e);
	}
}

// }}}
// {{{ emit_pull_body

static void emit_pull_body(HttpRequest* request)
{
	Event* e = event_new(request, HTTP_REQUEST_EVENT_PULL_BODY);

	D(D_EVENTS, "<- PULL BODY\n");

	if (e) {
		event_queue(e);
	}
}

// }}}
// {{{ emit_recv_headers

static void emit_recv_headers(HttpRequest* request)
{
	Event* e = event_new(request, HTTP_REQUEST_EVENT_RECV_HEADERS);

	D(D_EVENTS, "<- RECV HEADERS\n");

	if (e) {
		event_queue(e);
	}
}

// }}}
// {{{ emit_recv_body

static void emit_recv_body(HttpRequest* request, gchar* buf, gsize size)
{
	Event* e = event_new(request, HTTP_REQUEST_EVENT_RECV_BODY);

	D(D_EVENTS, "<- RECV BODY\n");

	if (e) {
		e->event.data = g_bytes_new(buf, size);

		event_queue(e);
	}
}

// }}}

// Conenction:

typedef struct _HttpConnection {
	gint ref_count;

	gboolean is_open;
	gchar* host;
	guint16 port;
	gboolean secure;

	// whether to close the connection after the request
	gboolean close;

	// whether request is complete and the connection is ready for the next one
	gboolean idle;

	time_t ts_started;
	time_t ts_completed;

	// cancellable for the gio socket api
	GCancellable* cancellable;

	// connection
	GSocketClient* client;
	GSocketConnection* conn;
	GDataInputStream* in_data;
	GInputStream* in; // don't free
	GOutputStream* out; // don't free
} HttpConnection;

// {{{ http_connection_new

static HttpConnection* http_connection_new(void)
{
	HttpConnection* c = g_slice_new0(HttpConnection);

	c->ref_count = 1;
	c->cancellable = g_cancellable_new();

	return c;
}

// }}}
// {{{ http_connection_ref

static HttpConnection* http_connection_ref(HttpConnection* connection)
{
	g_return_val_if_fail(connection != NULL, NULL);

	g_atomic_int_inc(&connection->ref_count);

	return connection;
}

// }}}
// {{{ http_connection_unref

static void http_connection_unref(HttpConnection* connection)
{
	g_return_if_fail(connection != NULL);

	if (g_atomic_int_dec_and_test(&connection->ref_count)) {
		g_clear_pointer(&connection->host, g_free);
		g_clear_object(&connection->client);
		g_clear_object(&connection->conn);
		g_clear_object(&connection->in_data);
		g_clear_object(&connection->cancellable);
		g_slice_free(HttpConnection, connection);
	}
}

// }}}
// {{{ http_connection_is_idle

static gboolean http_connection_is_idle(HttpConnection* connection)
{
	g_return_val_if_fail(connection != NULL, FALSE);

	return connection->idle;
}

// }}}
// {{{ http_connection_compare_idle_time

static gint http_connection_compare_idle_time(HttpConnection* c1, HttpConnection* c2)
{
	return c1->ts_completed - c2->ts_completed;
}

// }}}
// {{{ http_connection_matches_request

static gboolean http_connection_matches_request(HttpConnection* connection, HttpRequest* request)
{
	g_return_val_if_fail(connection != NULL, FALSE);
	g_return_val_if_fail(request != NULL, FALSE);

	return connection->secure == request->secure && g_str_equal(connection->host, request->host) && connection->port == request->port;
}

// }}}
// {{{ http_connection_abort

static void http_connection_abort(HttpConnection* connection)
{
	g_return_if_fail(connection != NULL);

	connection->close = TRUE;
	g_cancellable_cancel(connection->cancellable);
}

// }}}
// {{{ parse_http_status

G_LOCK_DEFINE_STATIC(parse_http_status_regex);
static GRegex* regex_status;

static gboolean parse_http_status(const gchar* line, gint* status, gchar** message)
{
	gc_match_info_unref GMatchInfo *match_info = NULL;

	G_LOCK(parse_http_status_regex);
	if (!regex_status)
		regex_status = g_regex_new("^HTTP/([0-9]+\\.[0-9]+) ([0-9]+) (.+)$", 0, 0, NULL);
	G_UNLOCK(parse_http_status_regex);

	if (g_regex_match(regex_status, line, 0, &match_info)) {
		if (status) {
			gc_free gchar* status_str = g_match_info_fetch(match_info, 2);

			*status = atoi(status_str);
		}

		if (message)
			*message = g_match_info_fetch(match_info, 3);

		return TRUE;
	}

	return FALSE;
}

// }}}
// {{{ http_connection_do_request

struct {
	gsize len;
	guchar* data;
} pinned_keys[] = {
	{
		.len = 294,
		.data = "\x30\x82\x01\x22\x30\x0D\x06\x09\x2A\x86\x48\x86\xF7\x0D\x01\x01\x01\x05\x00\x03\x82\x01\x0F\x00\x30\x82\x01\x0A\x02\x82\x01\x01\x00\xB6\x61\xE7\xCF\x69\x2A\x84\x35\x05\xC3\x14\xBC\x95\xCF\x94\x33\x1C\x82\x67\x3B\x04\x35\x11\xA0\x8D\xC8\x9D\xBB\x9C\x79\x65\xE7\x10\xD9\x91\x80\xC7\x81\x0C\xF4\x95\xBB\xB3\x26\x9B\x97\xD2\x14\x0F\x0B\xCA\xF0\x5E\x45\x7B\x32\xC6\xA4\x7D\x7A\xFE\x11\xE7\xB2\x5E\x21\x55\x23\x22\x1A\xCA\x1A\xF9\x21\xE1\x4E\xB7\x82\x0D\xEB\x9D\xCB\x4E\x3D\x0B\xE4\xED\x4A\xEF\xE4\xAB\x0C\xEC\x09\x69\xFE\xAE\x43\xEC\x19\x04\x3D\x5B\x68\x0F\x67\xE8\x80\xFF\x9B\x03\xEA\x50\xAB\x16\xD7\xE0\x4C\xB4\x42\xEF\x31\xE2\x32\x9F\xE4\xD5\xF4\xD8\xFD\x82\xCC\xC4\x50\xD9\x4D\xB5\xFB\x6D\xA2\xF3\xAF\x37\x67\x7F\x96\x4C\x54\x3D\x9B\x1C\xBD\x5C\x31\x6D\x10\x43\xD8\x22\x21\x01\x87\x63\x22\x89\x17\xCA\x92\xCB\xCB\xEC\xE8\xC7\xFF\x58\xE8\x18\xC4\xCE\x1B\xE5\x4F\x20\xA8\xCF\xD3\xB9\x9D\x5A\x7A\x69\xF2\xCA\x48\xF8\x87\x95\x3A\x32\x70\xB3\x1A\xF0\xC4\x45\x70\x43\x58\x18\xDA\x85\x29\x1D\xAF\x83\xC2\x35\xA9\xC1\x73\x76\xB4\x47\x22\x2B\x42\x9F\x93\x72\x3F\x9D\x3D\xA1\x47\x3D\xB0\x46\x37\x1B\xFD\x0E\x28\x68\xA0\xF6\x1D\x62\xB2\xDC\x69\xC7\x9B\x09\x1E\xB5\x47\x02\x03\x01\x00\x01"
	},
};

static int verify_pubkey(const char *file, const char *host, const char *service, const gnutls_datum_t * pubkey)
{
	int i;
	for (i = 0; i < G_N_ELEMENTS(pinned_keys); i++) {
		if (pinned_keys[i].len == pubkey->size && memcmp(pubkey->data, pinned_keys[i].data, pubkey->size) == 0) {
			return 0;
		}
	}

	return GNUTLS_E_NO_CERTIFICATE_FOUND;
}

static gboolean client_accept_certificate(GTlsConnection *conn, GTlsCertificate *peer_cert, GTlsCertificateFlags errors, gpointer user_data)
{
	gc_byte_array_unref GByteArray* der = NULL;
	g_object_get(peer_cert, "certificate", &der, NULL);

	if (der == NULL) {
		return FALSE;
	}

	gnutls_datum_t der_datum = {
		.data = der->data,
		.size = der->len
	};

	gnutls_tdb_t tdb = NULL;
	gnutls_tdb_init(&tdb);
	gnutls_tdb_set_verify_func(tdb, verify_pubkey);

	if (gnutls_verify_stored_pubkey(NULL, tdb, NULL, NULL, GNUTLS_CRT_X509, &der_datum, 0) < 0) {
		gnutls_tdb_deinit(tdb);
		return FALSE;
	}

	gnutls_tdb_deinit(tdb);
	return TRUE;
}

static void client_event(GSocketClient *client, GSocketClientEvent event, GSocketConnectable *connectable, GIOStream *connection, HttpConnection* http_connection)
{
	if (event == G_SOCKET_CLIENT_TLS_HANDSHAKING) {
		g_signal_connect(connection, "accept-certificate", G_CALLBACK(client_accept_certificate), http_connection);

		g_tls_connection_set_database(G_TLS_CONNECTION(connection), NULL);
	}
}

static gboolean http_connection_do_request(HttpConnection* connection, HttpRequest* request)
{
	gc_error_free GError* local_err = NULL;
	gssize response_length = -1;
	gssize request_length = -1;

	g_return_val_if_fail(connection != NULL, FALSE);
	g_return_val_if_fail(request != NULL, FALSE);

	if (!connection->is_open) {
		connection->is_open = TRUE;
		connection->secure = request->secure;
		connection->port = request->port;
		connection->host = g_strdup(request->host);

		// setup connection

		D(D_HTTP_PROGRESS, "-> connecting to %s:%d\n", request->host, (gint)request->port);

		connection->client = g_socket_client_new();

		g_signal_connect(connection->client, "event", G_CALLBACK(client_event), connection);

		// disable proxy settings and dbus error
		GProxyResolver* proxy_resolver = g_simple_proxy_resolver_new(NULL, NULL);
		g_socket_client_set_proxy_resolver(connection->client, proxy_resolver);

		g_socket_client_set_timeout(connection->client, 60);
		g_socket_client_set_family(connection->client, G_SOCKET_FAMILY_IPV4);

		if (request->secure && !g_tls_backend_supports_tls(g_tls_backend_get_default())) {
			emit_error(request, "no_tls", "TLS backend not found, please install glib-networking.");
			return FALSE;
		}

		g_socket_client_set_tls(connection->client, request->secure);

		gc_free gchar* uri = g_strdup_printf("%s://%s:%u", request->secure ? "https" : "http", request->host, request->port);
		connection->conn = g_socket_client_connect_to_uri(connection->client, uri, request->port, NULL, &local_err);
		if (!connection->conn) {
			emit_error_propagate(request, local_err, "conn_fail", "Connection failed: ");
			return FALSE;
		}

		D(D_HTTP_PROGRESS, "-> connected\n");

		connection->in_data = g_data_input_stream_new(g_io_stream_get_input_stream(G_IO_STREAM(connection->conn)));
		connection->in = G_INPUT_STREAM(connection->in_data);
		connection->out = g_io_stream_get_output_stream(G_IO_STREAM(connection->conn));

		g_data_input_stream_set_newline_type(connection->in_data, G_DATA_STREAM_NEWLINE_TYPE_ANY);
	}

	D(D_HTTP, "%s %s\n", request->method, request->url);

	// send headers

	D(D_HTTP_PROGRESS, "-> sending headers\n");

	http_request_set_header(request, "Host", request->host);
	http_request_set_header(request, "Connection", "close");
	//http_request_set_header(request, "Connection", "keep-alive");

        if (request->incremental) {
		const gchar* len = g_hash_table_lookup(request->request_headers, "Content-Length");
		if (!len) {
			emit_error(request, "setup_fail", "You must set Content-Length request header in incremental mode");
			return FALSE;
		}

		// XXX: check validity
		request_length = atoi(len);
	} else {
		gc_free gchar* len = g_strdup_printf("%" G_GSIZE_FORMAT, request->request_body_size);
		http_request_set_header(request, "Content-Length", len);
	}

	GHashTableIter iter;
	gchar *header_name, *header_value;
	g_hash_table_iter_init(&iter, request->request_headers);

	gc_string_free GString* headers = g_string_sized_new(300);
	g_string_append_printf(headers, "%s %s HTTP/1.1\r\n", request->method, request->resource);
	while (g_hash_table_iter_next(&iter, (gpointer*)&header_name, (gpointer*)&header_value)) {
		D(D_HTTP_HEADERS, "->   %s: %s\n", header_name, header_value);
		g_string_append_printf(headers, "%s: %s\r\n", header_name, header_value);
	}
	g_string_append(headers, "\r\n");

	if (!g_output_stream_write_all(connection->out, headers->str, headers->len, NULL, NULL, &local_err)) {
		emit_error_propagate(request, local_err, "send_fail", "Can't send request headers: ");
		return FALSE;
	}

	D(D_HTTP_PROGRESS, "-> headers sent\n");

	// send data if any

        if (request->incremental) {
		while (request_length > 0) {
			// ask for data
			emit_pull_body(request);

			// receive data
			gc_command_free Command* cmd = http_request_wait_for_command(request);
			if (!cmd) {
				emit_error(request, "command_timeout", "Timeout while expecting commands: continue, send_data");
				return FALSE;
			}

			if (cmd->type != COMMAND_TYPE_PUSH_BODY) {
				emit_error(request, "unexpected_command", "Expecting push_body command, got something else");
				return FALSE;
			}

			gsize size = 0;
			gconstpointer data = g_bytes_get_data(cmd->data, &size);
			if (!data || size == 0) {
				emit_error(request, "empty_data", "No body data provided. Expected at most %" G_GSSIZE_FORMAT ", got %" G_GSIZE_FORMAT, request_length, size);
				return FALSE;
			} else if (size > request_length) {
				emit_error(request, "too_much_data", "Too much body data provided. Expected at most %" G_GSSIZE_FORMAT ", got %" G_GSIZE_FORMAT, request_length, size);
				return FALSE;
			}

			if (!g_output_stream_write_all(connection->out, data, size, NULL, NULL, &local_err)) {
				emit_error_propagate(request, local_err, "send_fail", "Can't send request body: ");
				return FALSE;
			}

			request_length -= size;
		}
	} else {
		if (request->request_body) {
			D(D_HTTP_PROGRESS, "-> sending body\n");
			D(D_HTTP_BODY, "-> %s\n", request->request_body);

			if (!g_output_stream_write_all(connection->out, request->request_body, request->request_body_size, NULL, NULL, &local_err)) {
				emit_error_propagate(request, local_err, "send_fail", "Can't send request body: ");
				return FALSE;
			}

			D(D_HTTP_PROGRESS, "-> body sent\n");
		}
	}

	D(D_HTTP_PROGRESS, "<- waiting for headers\n");

        // receive headers

	g_hash_table_remove_all(request->response_headers);

	gint line_no = 0;
	while (TRUE) {
		line_no++;

		gc_free gchar* line = g_data_input_stream_read_line(connection->in_data, NULL, NULL, &local_err);
		if (line == NULL) {
			emit_error_propagate(request, local_err, "no_response", "No response: ");
			return FALSE;
		}

		if (line_no == 1) {
			gint status;
			gc_free gchar* message = NULL;

			if (!parse_http_status(line, &status, &message)) {
				emit_error_propagate(request, local_err, "invalid_status", "Can't read response status: ");
				return FALSE;
			}

			if (status == 500 && g_str_equal(message, "Server Too Busy")) {
				emit_error(request, "busy", "500 Server Too Busy");
				return FALSE;
			}

			if (status != 200 && status != 201 && status != 302 && status != 301) {
				gchar* code_str = g_strdup_printf("%d", status);
				emit_error(request, code_str, "Server returned %d: %s", status, message);
				return FALSE;
			}
		} else {
			if (*line == '\0') {
				break;
			} else {
				gchar* colon = strchr(line, ':');
				if (colon) {
					*colon = '\0';

					gchar* name = g_strstrip(g_ascii_strdown(line, -1));
					gchar* value = g_strstrip(g_strdup(colon + 1));

					if (!strcmp(name, "content-length")) {
						// XXX: check validity
						response_length = atoi(value);
					}

					if (!strcmp(name, "connection")) {
						connection->close = g_ascii_strcasecmp(value, "close") == 0;
					}

					D(D_HTTP_HEADERS, "<-   %s: %s\n", name, value);

					g_hash_table_insert(request->response_headers, name, value);
				} else {
					emit_error(request, "invalid_header", "Invalid response header %s", line);
					return FALSE;
				}
			}
		}
	}

	D(D_HTTP_PROGRESS, "<- headers received\n");

	if (response_length < 0) {
		emit_error(request, "no_length", "We need content length from the server!");
		return FALSE;
	}

	if (request->incremental) {
		emit_recv_headers(request);

		gc_command_free Command* cmd = http_request_wait_for_command(request);
		if (!cmd) {
			emit_error(request, "command_timeout", "Timeout while expecting commands: continue");
			return FALSE;
		}

		if (cmd->type != COMMAND_TYPE_CONTINUE) {
			emit_error(request, "unexpected_command", "Expecting continue command, got something else");
			return FALSE;
		}
	}

	D(D_HTTP_PROGRESS, "<- waiting for body\n");

	if (response_length == 0) {
		D(D_HTTP_BODY, "<- [empty]\n");
		emit_complete(request);
		return FALSE;
	}

	if (request->incremental) {
		// Use 128kB buffer
		gc_free gchar* buf = g_malloc(128 * 1024);
                gsize remaining_size = response_length;

		while (remaining_size > 0) {
			gsize bytes_read = 0;

			if (!g_input_stream_read_all(connection->in, buf, MIN(remaining_size, 128 * 1024), &bytes_read, NULL, &local_err)) {
				emit_error_propagate(request, local_err, "no_response", "Can't receive response body: ");
				return FALSE;
			}

			emit_recv_body(request, buf, bytes_read);

			gc_command_free Command* cmd = http_request_wait_for_command(request);
			if (!cmd) {
				emit_error(request, "command_timeout", "Timeout while expecting commands: continue");
				return FALSE;
			}

			if (cmd->type != COMMAND_TYPE_CONTINUE) {
				emit_error(request, "unexpected_command", "Expecting continue command, got something else");
				return FALSE;
			}

			remaining_size -= bytes_read;
		}
	} else {
		if (response_length > 256 * 1024 * 1024) {
			gc_free gchar* size_str = g_format_size_full(response_length, G_FORMAT_SIZE_LONG_FORMAT);
			emit_error(request, "too_big", "Response is too big: %s", size_str);
			return FALSE;
		}

		gc_free gchar* buf = g_malloc(response_length + 1);
		buf[response_length] = '\0';
		gsize actual_response_length = 0;

		if (!g_input_stream_read_all(connection->in, buf, response_length, &actual_response_length, NULL, &local_err)) {
			emit_error_propagate(request, local_err, "no_response", "Can't receive response body: ");
			return FALSE;
		}

		if (response_length != actual_response_length) {
			emit_error(request, "short_response", "Expecting %u, got %u bytes", response_length, actual_response_length);
			return FALSE;
		}

		request->response_body = buf; buf = NULL;
		request->response_body_size = response_length;

		D(D_HTTP_BODY, "<- %s\n", request->response_body);
	}

	emit_complete(request);

	connection->idle = TRUE;
	if (connection->close) {
		return FALSE;
	}

	return TRUE;
}

// }}}

typedef struct _WorkerCommand WorkerCommand;
typedef struct _Worker Worker;
typedef struct _ManagerCommand ManagerCommand;
typedef struct _Manager Manager;

enum {
	WORKER_COMMAND_DO_REQUEST,
	WORKER_COMMAND_WORKER_STOPPED,
	WORKER_COMMAND_STOP
};

struct _WorkerCommand {
	gint type;
	HttpRequest* request;
};

struct _Worker {
	gint ref_count;
	GThread* thread;
	GAsyncQueue* commands;
	Manager* manager;

	HttpConnection* connection;
};

enum {
	MANAGER_COMMAND_QUEUE_REQUEST,
	MANAGER_COMMAND_WORKER_STOPPED,
	MANAGER_COMMAND_STOP
};

struct _ManagerCommand {
	gint type;
	Worker* worker;
	HttpRequest* request;
};

struct _Manager {
	gint ref_count;
	GThread* thread;
	GAsyncQueue* commands;
	GList* workers;
};

static gpointer worker_thread(Worker* worker);
static gpointer manager_thread(Manager* manager);
static Worker* worker_ref(Worker* worker);
static Manager* manager_ref(Manager* manager);
static void manager_unref(Manager* manager);
static void worker_unref(Worker* worker);

// {{{ WorkerCommand

static WorkerCommand* worker_command_new(gint type)
{
	WorkerCommand* cmd = g_new0(WorkerCommand, 1);

	cmd->type = type;

	return cmd;
}

static void worker_command_free(WorkerCommand* command)
{
	g_return_if_fail(command != NULL);

	g_clear_pointer(&command->request, http_request_unref);
	g_free(command);
}

// }}}
// {{{ Worker

static Worker* worker_new(Manager* manager)
{
	g_return_val_if_fail(manager != NULL, NULL);

	Worker* worker = g_new0(Worker, 1);

	worker->ref_count = 2;
	worker->commands = g_async_queue_new_full((GDestroyNotify)worker_command_free);
	worker->manager = manager_ref(manager);
	worker->thread = g_thread_new("http worker", (GThreadFunc)worker_thread, worker);

	return worker;
}

static void worker_stop(Worker* worker)
{
	g_async_queue_push(worker->commands, worker_command_new(WORKER_COMMAND_STOP));
}

static void worker_join(Worker* worker)
{
	g_thread_join(worker->thread);
}

static void worker_do_request(Worker* worker, HttpRequest* request)
{
	WorkerCommand* command = worker_command_new(WORKER_COMMAND_DO_REQUEST);
	command->request = http_request_ref(request);
	g_async_queue_push(worker->commands, command);
}

static Worker* worker_ref(Worker* worker)
{
	g_return_val_if_fail(worker != NULL, NULL);

	g_atomic_int_inc(&worker->ref_count);

	return worker;
}

static void worker_unref(Worker* worker)
{
	g_return_if_fail(worker != NULL);

	if (g_atomic_int_dec_and_test(&worker->ref_count)) {
		D(D_THREAD_MEM, "<- WORKER FREE %p\n", worker);
		g_thread_unref(worker->thread);
		g_async_queue_unref(worker->commands);
		g_clear_pointer(&worker->manager, manager_unref);
		g_free(worker);
	}
}

// }}}
// {{{ ManagerCommand

static ManagerCommand* manager_command_new(gint type)
{
	ManagerCommand* cmd = g_new0(ManagerCommand, 1);

	cmd->type = type;

	return cmd;
}

static void manager_command_free(ManagerCommand* command)
{
	g_return_if_fail(command != NULL);

	g_clear_pointer(&command->request, http_request_unref);
	g_clear_pointer(&command->worker, worker_unref);
	g_free(command);
}

// }}}
// {{{ Manager

static Manager* manager_new()
{
	Manager* manager = g_new0(Manager, 1);

	manager->ref_count = 2; // two refs, one for the caller, second for the thread
	manager->commands = g_async_queue_new_full((GDestroyNotify)manager_command_free);
	manager->thread = g_thread_new("http manager", (GThreadFunc)manager_thread, manager);

	return manager;
}

static void manager_stop(Manager* manager)
{
	g_async_queue_push(manager->commands, manager_command_new(MANAGER_COMMAND_STOP));
}

static void manager_notify_worker_stopped(Manager* manager, Worker* worker)
{
	ManagerCommand* command = manager_command_new(MANAGER_COMMAND_WORKER_STOPPED);
	command->worker = worker_ref(worker);
	g_async_queue_push(manager->commands, command);
}

static void manager_queue_request(Manager* manager, HttpRequest* request)
{
	ManagerCommand* command = manager_command_new(MANAGER_COMMAND_QUEUE_REQUEST);
	command->request = http_request_ref(request);
	g_async_queue_push(manager->commands, command);
}

static Manager* manager_ref(Manager* manager)
{
	g_return_val_if_fail(manager != NULL, NULL);

	g_atomic_int_inc(&manager->ref_count);

	return manager;
}

static void manager_unref(Manager* manager)
{
	g_return_if_fail(manager != NULL);

	if (g_atomic_int_dec_and_test(&manager->ref_count)) {
		D(D_THREAD_MEM, "<- MANAGER FREE %p\n", manager);
		g_thread_unref(manager->thread);
		g_async_queue_unref(manager->commands);
		g_list_foreach(manager->workers, (GFunc)worker_unref, NULL);
		g_free(manager);
	}
}

// }}}

static gpointer worker_thread(Worker* worker)
{
	D(D_THREADS, "<- WORKER UP %p\n", worker);
	HttpConnection* connection = http_connection_new();

	while (TRUE) {
		WorkerCommand* command = g_async_queue_pop(worker->commands);
		D(D_THREAD_MESSAGES, "<- WORKER %p RECEIVED COMMAND %d\n", worker, command->type);

		switch (command->type) {
			case WORKER_COMMAND_STOP:
				worker_command_free(command);
				goto out;

			case WORKER_COMMAND_DO_REQUEST:
				if (!http_connection_do_request(connection, command->request)) {
					worker_command_free(command);
					goto out;
				}

				break;

			default:
				g_assert_not_reached();
		}

		worker_command_free(command);
	}

out:
	http_connection_unref(connection);
	manager_notify_worker_stopped(worker->manager, worker);
	worker_unref(worker);
	D(D_THREADS, "<- WORKER DOWN %p\n", worker);
	return NULL;
}

static gpointer manager_thread(Manager* manager)
{
	D(D_THREADS, "<- MANAGER UP %p\n", manager);

	while (TRUE) {
		ManagerCommand* command = g_async_queue_pop(manager->commands);
		D(D_THREAD_MESSAGES, "<- MANAGER %p RECEIVED COMMAND %d\n", manager, command->type);

		switch (command->type) {
			case MANAGER_COMMAND_STOP:
				// stop and join workers
				g_list_foreach(manager->workers, (GFunc)worker_stop, NULL);
				g_list_foreach(manager->workers, (GFunc)worker_join, NULL);
				manager_command_free(command);
				goto out;

			case MANAGER_COMMAND_QUEUE_REQUEST: {
				Worker* worker = worker_new(manager);
				manager->workers = g_list_prepend(manager->workers, worker);
                                worker_do_request(worker, command->request);
				break;
			}

			case MANAGER_COMMAND_WORKER_STOPPED:
				manager->workers = g_list_remove(manager->workers, command->worker);
				worker_unref(command->worker);
				break;

			default:
				g_assert_not_reached();
		}

		manager_command_free(command);
	}

out:
	manager_unref(manager);
	D(D_THREADS, "<- MANAGER DOWN %p\n", manager);
	return NULL;
}


#if 0
typedef gboolean (*FilterFunc)(gconstpointer a, gpointer user_data);

static GList* list_filter(GList* in, FilterFunc func, gpointer user_data)
{
	GList *iter, *out = NULL; 

	for (iter = in; iter; iter = iter->next) {
		if (func(iter->data, user_data)) {
			out = g_list_prepend(out, iter->data);
		}
	}

	return g_list_reverse(out);
}

	// fifo processing with priority given to already established
	// connections
	for (iter = g_list_last(queued_requests); iter; iter = iter->prev) {
		HttpRequest* request = iter->data;
		
		// just add a new connection for now
                connections = g_list_append(connections, http_connection_new(request));

		// first check if we can pipeline request right away
		HttpConnection* connection = find_idle_connection_for_request(request);
		if (connection) {
			http_connection_continue_with(request);
		} else {
			guint total = g_list_length(connections);
			GList* idling_connections = list_filter(connections, (FilterFunc)http_connection_is_idle);
			idling_connections = g_list_sort(idling_connections, compare_idle_time);
			guint idling = g_list_length(idling_connections);

			if (total < max_connections && !request->priority) {
			}
			http_connection_replace_with(request);
		}

		if (!connection) {
			
		}
	}
#endif

// }}}

// Public queue API:

static Manager* manager;

// {{{ http_init

gboolean http_init(void)
{
	manager = manager_new();

	return TRUE;
}

// }}}
// {{{ http_queue_request

// takes request ref
gboolean http_queue_request(HttpRequest* request)
{
	GError* local_error = NULL;

	g_return_val_if_fail(request != NULL, FALSE);

	if (request->invalid) {
		emit_error(request, "url", "Invalid URL: %s", request->url);
		return FALSE;
	}

	if (request->queued) {
		emit_error(request, "already_queued", "Request %s %s is already queued", request->method, request->url);
		return FALSE;
	}

	request->queued = TRUE;
	manager_queue_request(manager, request);

	return TRUE;
}

// }}}
// {{{ http_cleanup

void http_cleanup(void)
{
	manager_stop(manager);
	manager_unref(manager);
}

// }}}

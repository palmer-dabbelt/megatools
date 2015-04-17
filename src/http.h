#ifndef __MEGATOOLS_HTTP_H__
#define __MEGATOOLS_HTTP_H__

#include <glib.h>

G_BEGIN_DECLS

typedef struct _HttpRequest HttpRequest;
typedef struct _HttpRequestEvent HttpRequestEvent;

typedef enum {
	HTTP_REQUEST_EVENT_NONE = 0,
	HTTP_REQUEST_EVENT_PULL_BODY,
	HTTP_REQUEST_EVENT_RECV_HEADERS,
	HTTP_REQUEST_EVENT_RECV_BODY,
	HTTP_REQUEST_EVENT_COMPLETE,
	HTTP_REQUEST_EVENT_ERROR,
} HttpRequestEventType;

struct _HttpRequestEvent {
	HttpRequestEventType type;

	union {
		struct {
			gchar* error_code;
			gchar* error_message;
		};

		struct {
			GBytes* data;
		};
	};
};

typedef void		(*HttpRequestEventCallbackFunc)		(HttpRequest* request, HttpRequestEvent* event, gpointer user_data);

HttpRequest*		http_request_new			(const gchar* method, const gchar* url, gboolean incremental);
HttpRequest*            http_request_ref			(HttpRequest* request);
void                    http_request_unref			(HttpRequest* request);
void                    http_request_set_header			(HttpRequest* request, const gchar* name, const gchar* value);
const gchar*            http_request_get_response_header	(HttpRequest* request, const gchar* name);
void                    http_request_set_event_callback 	(HttpRequest* request, HttpRequestEventCallbackFunc cb, gpointer user_data);

// API for non-incremental mode:

void                    http_request_set_body			(HttpRequest* request, const gchar* data, gssize len);
const guchar*           http_request_get_response_body		(HttpRequest* request, gsize* len);

// API for incremental mode:

gboolean                http_request_is_incremental		(HttpRequest* request);
void                    http_request_push_body	                (HttpRequest* request, const gchar* data, gssize len);
void                    http_request_continue	                (HttpRequest* request);

// HTTP manager:

gboolean                http_init				(void);
gboolean	        http_queue_request			(HttpRequest* request);
void                    http_cleanup				(void);

G_END_DECLS

#endif

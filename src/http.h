#ifndef __MEGATOOLS_HTTP_H__
#define __MEGATOOLS_HTTP_H__

#include <glib.h>

G_BEGIN_DECLS

typedef struct _HttpRequest HttpRequest;
typedef struct _HttpRequestEvent HttpRequestEvent;

typedef enum {
	HTTP_REQUEST_EVENT_NONE = 0,
	HTTP_REQUEST_EVENT_COMPLETE,
	HTTP_REQUEST_EVENT_DATA,
	HTTP_REQUEST_EVENT_ERROR,
} HttpRequestEventType;

struct _HttpRequestEvent {
	HttpRequestEventType type;

	gchar* error_code;
	gchar* error_message;

	gsize data_off;
	gsize data_size;
	gchar* data;
};

typedef void		(*HttpRequestEventCallbackFunc)		(HttpRequest* request, HttpRequestEvent* event, gpointer user_data);

HttpRequest*		http_request_new			(const gchar* method, const gchar* url);
void                    http_request_set_header			(HttpRequest* request, const gchar* name, const gchar* value);
void                    http_request_set_data			(HttpRequest* request, const gchar* data, gssize len);
void                    http_request_set_event_callback 	(HttpRequest* request, HttpRequestEventCallbackFunc cb, gpointer user_data);
HttpRequest*            http_request_ref			(HttpRequest* request);
void                    http_request_unref			(HttpRequest* request);

const gchar*            http_request_get_response_header	(HttpRequest* request, const gchar* name);
const guchar*           http_request_get_response_body		(HttpRequest* request, gsize* len);
gboolean                http_request_is_ondemand		(HttpRequest* request);

gboolean                http_init				(void);
gboolean	        http_queue_request			(HttpRequest* request);
void                    http_cleanup				(void);

G_END_DECLS

#endif

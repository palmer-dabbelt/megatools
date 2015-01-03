#ifndef __MEGATOOLS_JS_H__
#define __MEGATOOLS_JS_H__

#include <glib.h>
#include "duktape.h"

typedef struct _JsRef JsRef;

JsRef*		js_ref_take		(duk_context* ctx);
void		js_ref_set_data		(JsRef* ref, gpointer user_data, GDestroyNotify user_data_free);
gpointer	js_ref_get_data		(JsRef* ref);
void		js_ref_drop		(JsRef* ref);
duk_context*	js_ref_push		(JsRef* ref);

gboolean	js_get_object_function	(duk_context* ctx, duk_idx_t index, const gchar* name);
guint		js_get_object_uint	(duk_context* ctx, duk_idx_t index, const gchar* name);
const gchar*	js_get_object_string	(duk_context* ctx, duk_idx_t index, const gchar* name);

#endif

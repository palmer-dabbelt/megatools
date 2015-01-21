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
guint64		js_get_object_uint64	(duk_context* ctx, duk_idx_t index, const gchar* name);
gboolean        js_get_object_boolean   (duk_context* ctx, duk_idx_t index, const gchar* name);

guint64		js_require_uint64	(duk_context* ctx, duk_idx_t idx);
void		js_push_uint64		(duk_context* ctx, guint64 v);

void		js_c_class_create	(duk_context* ctx, const gchar* name, gsize data_size, GDestroyNotify data_free);
gpointer	js_c_object_new		(duk_context* ctx, const gchar* cls_name);
gpointer	js_c_object_get		(duk_context* ctx, duk_idx_t idx, const gchar* cls_name);
gpointer	js_c_object_require	(duk_context* ctx, duk_idx_t idx, const gchar* cls_name);
gpointer	js_c_object_this	(duk_context* ctx, const gchar* cls_name);

void		js_throw_gerror		(duk_context* ctx, GError* error);

void            js_push_gbytes          (duk_context* ctx, GBytes* bytes);
GBytes*         js_get_gbytes           (duk_context* ctx, duk_idx_t idx);

#endif

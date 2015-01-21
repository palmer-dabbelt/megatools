#include "js.h"

struct _JsRef
{
	duk_idx_t idx;
	duk_context* ctx;

	gpointer user_data;
	GDestroyNotify user_data_free;
};

JsRef* js_ref_take(duk_context* ctx)
{
	g_return_val_if_fail(ctx != NULL, NULL);

	// if undefined, pop and return NULL
	if (duk_is_undefined(ctx, -1)) {
		duk_pop(ctx);
		return NULL;
	}

	JsRef* ref = g_slice_new0(JsRef);
	ref->ctx = ctx;

	// get refs array from the heap
	duk_push_heap_stash(ctx);
	duk_get_prop_string(ctx, -1, "refs");

	if (!duk_is_array(ctx, -1)) {
		duk_pop(ctx);
		duk_push_array(ctx);
		duk_push_int(ctx, 0);
		duk_put_prop_index(ctx, -2, 0);
		duk_dup_top(ctx);
		duk_put_prop_string(ctx, -3, "refs");
	}

	// remove heap
	duk_swap_top(ctx, -2);
	duk_pop(ctx);

	// [... ref refs]

	// free_idx = refs[0]
	duk_get_prop_index(ctx, -1, 0);
	duk_idx_t free_idx = duk_get_int(ctx, -1);
	duk_pop(ctx);

	if (free_idx != 0) {
		// refs[0] = refs[free_idx]
		duk_get_prop_index(ctx, -1, free_idx);
		duk_put_prop_index(ctx, -2, 0);
		ref->idx = free_idx;
	} else {
		ref->idx = duk_get_length(ctx, -1);
	}

	duk_swap_top(ctx, -2);

	// [... refs ref]

	// refs[ref] = value
	duk_put_prop_index(ctx, -2, ref->idx);
	duk_pop(ctx);

	return ref;
}

void js_ref_set_data(JsRef* ref, gpointer user_data, GDestroyNotify user_data_free)
{
	g_return_if_fail(ref != NULL);

	if (ref->user_data_free) {
		ref->user_data_free(ref->user_data);
		ref->user_data_free = NULL;
		ref->user_data = NULL;
	}

	ref->user_data = user_data;
	ref->user_data_free = user_data_free;
}

gpointer js_ref_get_data(JsRef* ref)
{
	g_return_val_if_fail(ref != NULL, NULL);

	return ref->user_data;
}

void js_ref_drop(JsRef* ref)
{
	g_return_if_fail(ref != NULL);

	duk_context* ctx = ref->ctx;

	if (ref->user_data_free) {
		ref->user_data_free(ref->user_data);
		ref->user_data_free = NULL;
		ref->user_data = NULL;
	}

	duk_push_heap_stash(ctx);
	duk_get_prop_string(ctx, -1, "refs");
	duk_swap_top(ctx, -2);
	duk_pop(ctx);

	// refs[ref] = refs[0]
	duk_get_prop_index(ctx, -1, 0);
	duk_put_prop_index(ctx, -2, ref->idx);

	// refs[0] = ref
	duk_push_int(ctx, ref->idx);
	duk_put_prop_index(ctx, -2, 0);

	duk_pop(ctx);

	g_slice_free(JsRef, ref);
}

duk_context* js_ref_push(JsRef* ref)
{
	g_return_if_fail(ref != NULL);

	duk_context* ctx = ref->ctx;

	duk_push_heap_stash(ctx);
	duk_get_prop_string(ctx, -1, "refs");
	duk_swap_top(ctx, -2);
	duk_pop(ctx);

	duk_get_prop_index(ctx, -1, ref->idx);
	duk_swap_top(ctx, -2);
	duk_pop(ctx);

	return ref->ctx;
}

gboolean js_get_object_function(duk_context* ctx, duk_idx_t index, const gchar* name)
{
	duk_get_prop_string(ctx, index, name);
	if (duk_is_function(ctx, -1)) {
		return TRUE;
	}

	duk_pop(ctx);
	return FALSE;
}

guint js_get_object_uint(duk_context* ctx, duk_idx_t index, const gchar* name)
{
	guint v;

	duk_get_prop_string(ctx, index, name);
	v = duk_to_uint(ctx, -1);
	duk_pop(ctx);

	return v;
}

const gchar* js_get_object_string(duk_context* ctx, duk_idx_t index, const gchar* name)
{
	const gchar* str = NULL;

	duk_get_prop_string(ctx, index, name);

	if (duk_is_string(ctx, -1)) {
		str = duk_to_string(ctx, -1);
	}

	duk_pop(ctx);

	return str;
}

guint64 js_get_object_uint64(duk_context* ctx, duk_idx_t index, const gchar* name)
{
	guint64 v = 0;

	duk_get_prop_string(ctx, index, name);

	if (duk_is_string(ctx, -1) || duk_is_number(ctx, -1)) {
		v = js_require_uint64(ctx, -1);
	}

	duk_pop(ctx);

	return v;
}

gboolean js_get_object_boolean(duk_context* ctx, duk_idx_t index, const gchar* name)
{
	gboolean v;

	duk_get_prop_string(ctx, index, name);
	v = duk_to_boolean(ctx, -1);

	duk_pop(ctx);

	return v;
}

guint64 js_require_uint64(duk_context* ctx, duk_idx_t idx)
{
	if (duk_is_number(ctx, idx))
		return (guint64)duk_get_uint(ctx, idx);
	else if (duk_is_string(ctx, idx)) {
		guint64 v;
		const char* str = duk_get_string(ctx, idx);

		if (sscanf(str, "%" G_GUINT64_FORMAT, &v) != 1) {
			duk_error(ctx, DUK_ERR_API_ERROR, "String is not formatted as a number");
		}

		return v;
	} else {
		duk_error(ctx, DUK_ERR_TYPE_ERROR, "Must be number or string");
	}
}

void js_push_uint64(duk_context* ctx, guint64 v)
{
	if (v > DUK_UINT_MAX)
		duk_push_sprintf(ctx, "%" G_GUINT64_FORMAT, (guint64)v);
	else
		duk_push_uint(ctx, (duk_uint_t)v);
}

typedef struct
{
	gsize data_size;
	GDestroyNotify data_free;
	gchar* name;
} ClassData;

static duk_ret_t class_finalizer(duk_context *ctx) 
{
	duk_get_prop_string(ctx, 0, "\xFF" "c-class-data");

	if (duk_is_pointer(ctx, -1)) {
		ClassData* data = duk_get_pointer(ctx, -1);
		g_free(data->name);
		g_free(data);

		duk_del_prop_string(ctx, 0, "\xFF" "c-class-data");
	}

	return 0;
}

static void js_c_classes_get(duk_context* ctx)
{
	duk_push_heap_stash(ctx);
        duk_get_prop_string(ctx, -1, "c-classes");

	// [..., stash, c-classes]

	// if c-classes doesn't exist, create new
	if (!duk_is_object(ctx, -1)) {
		duk_pop(ctx);
		duk_push_object(ctx);
		duk_dup_top(ctx);
		// [..., stash, c-classes, c-classes]
		duk_put_prop_string(ctx, -3, "c-classes");
	}

	// [..., stash, c-classes]

	duk_swap_top(ctx, -2);
	duk_pop(ctx);
}

void js_c_class_create(duk_context* ctx, const gchar* name, gsize data_size, GDestroyNotify data_free)
{
	g_return_if_fail(ctx != NULL);
	g_return_if_fail(name != NULL);

	js_c_classes_get(ctx);

	// check if the class already exists
        duk_get_prop_string(ctx, -1, name);
	if (duk_is_object(ctx, -1)) {
		// terminate program
		g_assert_not_reached();
	}
	duk_pop(ctx);

	// [..., c-classes]

        duk_push_object(ctx);
	duk_dup_top(ctx);
	duk_put_prop_string(ctx, -3, name);
	duk_swap_top(ctx, -2);
	duk_pop(ctx);

	ClassData* data = g_new0(ClassData, 1);
	data->name = g_strdup(name);
	data->data_size = data_size;
	data->data_free = data_free;

        // associate with cls data
	duk_push_pointer(ctx, data);
	duk_put_prop_string(ctx, -2, "\xFF" "c-class-data");

	// set finalizer
	duk_push_c_function(ctx, class_finalizer, 1);
	duk_set_finalizer(ctx, -2);
}

static duk_ret_t object_finalizer(duk_context *ctx) 
{
	duk_get_prop_string(ctx, 0, "\xFF" "c-object-data-free");
	duk_get_prop_string(ctx, 0, "\xFF" "c-object-data");

	if (duk_is_pointer(ctx, -1)) {
		GDestroyNotify data_free = duk_get_pointer(ctx, -2);
		gpointer* data = duk_get_pointer(ctx, -1);

		if (data) {
			if (data_free)
				data_free(data);

			g_free(data);
		}

		duk_del_prop_string(ctx, 0, "\xFF" "c-object-data");
		duk_del_prop_string(ctx, 0, "\xFF" "c-object-data-free");
	}

	return 0;
}

gpointer js_c_object_new(duk_context* ctx, const gchar* cls_name)
{
	g_return_if_fail(ctx != NULL);
	g_return_if_fail(cls_name != NULL);

	js_c_classes_get(ctx);

        duk_get_prop_string(ctx, -1, cls_name);
	if (!duk_is_object(ctx, -1))
		duk_error(ctx, DUK_ERR_API_ERROR, "C-Class %s is not defined", cls_name);

	// [.., c-classes, c-class]
	
	duk_swap_top(ctx, -2);
	duk_pop(ctx);

	// [.., c-class]

	// get ClassData
	duk_get_prop_string(ctx, -1, "\xFF" "c-class-data");
	if (!duk_is_pointer(ctx, -1))
		duk_error(ctx, DUK_ERR_API_ERROR, "C-Class %s is missing c-data-pointer", cls_name);

	ClassData* cls_data = duk_get_pointer(ctx, -1);
	duk_pop(ctx);

	// create object and setup prototype

	duk_push_object(ctx);
	duk_swap_top(ctx, -2);
	duk_set_prototype(ctx, -2);

	// [.., c-object]

	duk_push_string(ctx, cls_name);
	duk_put_prop_string(ctx, -2, "\xFF" "c-object-class-name");

	// setup c-object-data
	gpointer data = g_malloc0(cls_data->data_size);

	duk_push_pointer(ctx, data);
	duk_put_prop_string(ctx, -2, "\xFF" "c-object-data");

	if (cls_data->data_free) {
		duk_push_pointer(ctx, cls_data->data_free);
		duk_put_prop_string(ctx, -2, "\xFF" "c-object-data-free");
	}

	// set finalizer
	duk_push_c_function(ctx, object_finalizer, 1);
	duk_set_finalizer(ctx, -2);

	return data;

}

gpointer js_c_object_get(duk_context* ctx, duk_idx_t idx, const gchar* cls_name)
{
	g_return_val_if_fail(ctx != NULL, NULL);
	g_return_val_if_fail(cls_name != NULL, NULL);

	if (!duk_is_object(ctx, idx))
		return NULL;

	duk_get_prop_string(ctx, -1, "\xFF" "c-object-class-name");
	const gchar* obj_cls_name = duk_get_string(ctx, -1);
	duk_pop(ctx);

	if (g_strcmp0(obj_cls_name, cls_name) != 0)
		return NULL;

	duk_get_prop_string(ctx, -1, "\xFF" "c-object-data");
	gpointer obj_data = duk_get_pointer(ctx, -1);
	duk_pop(ctx);

	return obj_data;
}

gpointer js_c_object_require(duk_context* ctx, duk_idx_t idx, const gchar* cls_name)
{
	gpointer data = js_c_object_get(ctx, idx, cls_name);
	if (data == NULL)
		duk_error(ctx, DUK_ERR_API_ERROR, "Can't get c-object %s", cls_name);

	return data;
}

gpointer js_c_object_this(duk_context* ctx, const gchar* cls_name)
{
	duk_push_this(ctx);

	return js_c_object_require(ctx, -1, cls_name);
}

void js_throw_gerror(duk_context* ctx, GError* error)
{
	g_return_if_fail(ctx != NULL);

	if (error) {
		duk_push_error_object(ctx, DUK_ERR_API_ERROR, "%s", error->message);
		g_error_free(error);
	} else {
		duk_push_error_object(ctx, DUK_ERR_API_ERROR, "Empty gerror");
	}

	duk_throw(ctx);
}

void js_push_gbytes(duk_context* ctx, GBytes* bytes)
{
        g_return_if_fail(ctx != NULL);

        if (bytes == NULL) {
		duk_push_undefined(ctx);
                return;
        }

	gsize len;
	gconstpointer data = g_bytes_get_data(bytes, &len);

	guchar* buf = duk_push_fixed_buffer(ctx, len);
	memcpy(buf, data, len);
}

GBytes* js_get_gbytes(duk_context* ctx, duk_idx_t idx)
{
	if (duk_is_null_or_undefined(ctx, idx)) {
		return NULL;
	}

	duk_dup(ctx, idx);
	duk_to_string(ctx, -1);

	duk_size_t size;
	const char* data = duk_get_lstring(ctx, -1, &size);
	GBytes* bytes = g_bytes_new(data, size);

	duk_pop(ctx);

	return bytes;
}

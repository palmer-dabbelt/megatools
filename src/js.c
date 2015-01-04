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
	guint v = 0;

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

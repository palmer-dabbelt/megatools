#ifndef __MEGATOOLS_MAIN_H__
#define __MEGATOOLS_MAIN_H__

#include "duktape.h"

void js_handle_exception(duk_context* ctx, const gchar* loc);

#endif

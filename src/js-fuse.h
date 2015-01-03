#ifndef __MEGATOOLS_JS_FUSE_H__
#define __MEGATOOLS_JS_FUSE_H__

#include "duktape.h"

void js_fuse_cleanup(void);
void js_fuse_init(duk_context* ctx);

#endif

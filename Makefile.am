jsfiles = \
	js/libs/underscore-min.js \
	js/libs/gw.js \
	js/utils.js \
	js/defer.js \
	js/log.js \
	js/api.js \
	js/session.js \
	js/test.js \
	js/tests/crypto.js \
	js/tests/api.js \
	js/tests/session.js \
	js/tests/http.js \
	js/tests/timer.js \
	js/tool.js \
	js/tools/register.js \
	js/tools/passwd.js \
	js/tools/reset.js \
	js/tools/info.js \
	js/tools/df.js \
	js/tools/ls.js \
	js/tools/fs.js \
	js/main.js

BUILT_SOURCES = src/resources.c src/resources.xml
DISTCLEANFILES = $(BUILT_SOURCES)
CLEANFILES =
EXTRA_DIST = \
	resources.sh \
	$(jsfiles)

AM_CFLAGS = \
	-DG_LOG_DOMAIN=\"Megatools\" \
	$(GLIB_CFLAGS) \
	$(NETTLE_CFLAGS) \
	-I$(srcdir)/src \
	-I$(srcdir)/duktape \
	-I$(srcdir)/sjson \
	-I$(srcdir)

LIBS = -lm -lgmp \
	$(GLIB_LIBS) \
	$(NETTLE_LIBS)

bin_PROGRAMS = megatools

megatools_SOURCES = \
	src/alloc.h \
	src/js.c \
	src/js.h \
	src/js-http.c \
	src/js-http.h \
	src/js-misc.gen.c \
	src/js-misc.h \
	src/js-crypto.c \
	src/js-crypto.h \
	src/crypto.c \
	src/crypto.h \
	src/http.c \
	src/http.h \
	src/resources.c \
	duktape/duktape.c \
	duktape/duktape.h \
	sjson/sjson.h \
	sjson/sjson.gen.c \
	src/main.h \
	src/main.c

if ENABLE_FUSE
LIBS += $(FUSE_LIBS)
AM_CFLAGS += $(FUSE_CFLAGS)
megatools_SOURCES += \
	src/js-fuse.c \
	src/js-fuse.h
else
megatools_SOURCES += \
	src/js-fuse-nop.c \
	src/js-fuse.h
endif

sjson/sjson.gen.c: sjson/sjson.c
	$(RE2C) -s -o $@ $<

src/js-misc.gen.c: src/js-misc.c
	$(RE2C) -s -o $@ $<

BUILT_SOURCES += \
	src/js-misc.gen.c \
	sjson/sjson.gen.c

EXTRA_DIST += \
	src/js-misc.c \
	sjson/sjson.c

src/resources.c: src/resources.xml
	glib-compile-resources --target=$@ --sourcedir $(top_srcdir) --generate-source $<

src/resources.xml: $(jsfiles)
	$(srcdir)/resources.sh $(top_srcdir) > $@

EXTRA_DIST += LICENSE HACKING
doc_DATA = LICENSE NEWS TODO README INSTALL HACKING

export MAKEFLAGS += --no-print-directory -s
ACLOCAL_AMFLAGS = -I m4

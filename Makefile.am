tools = doc register passwd reset info df ls export fs contacts share rm rmdir mkdir cp
tests = crypto api session http timer misc

jsfiles = \
	js/libs/underscore-min.js \
	js/libs/gw.js \
	js/utils.js \
	js/defer.js \
	js/log.js \
	js/docs.js \
	js/api.js \
	js/session.js \
	js/test.js \
	$(addprefix js/tests/,$(addsuffix .js,$(tests))) \
	js/tool.js \
	$(addprefix js/tools/,$(addsuffix .js,$(tools))) \
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
	$(NCURSES_CFLAGS) \
	-I$(srcdir)/src \
	-I$(srcdir)/duktape \
	-I$(srcdir)/sjson \
	-I$(srcdir)

LIBS = -lm -lgmp \
	$(GLIB_LIBS) \
	$(NCURSES_LIBS) \
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
	$(AM_V_GEN)$(RE2C) -s -o $@ $<

src/js-misc.gen.c: src/js-misc.c
	$(AM_V_GEN)$(RE2C) -s -o $@ $<

BUILT_SOURCES += \
	src/js-misc.gen.c \
	sjson/sjson.gen.c

EXTRA_DIST += \
	src/js-misc.c \
	sjson/sjson.c

src/resources.c: src/resources.xml
	$(AM_V_GEN)glib-compile-resources --target=$@ --sourcedir $(top_srcdir) --generate-source $<

src/resources.xml: $(jsfiles)
	$(AM_V_GEN)$(srcdir)/resources.sh $(top_srcdir) > $@

manpages = $(addprefix docs/,$(addsuffix .1,$(addprefix megatools-,$(tools)) megatools))

docs/%.1: megatools
	mkdir -p docs/
	$(AM_V_GEN)./megatools doc --output docs/ --format man $(patsubst docs/%.1,%,$@)

man1_MANS = $(manpages)

CLEANFILES += $(man1_MANS)

EXTRA_DIST += LICENSE HACKING
doc_DATA = LICENSE NEWS TODO README INSTALL HACKING

export MAKEFLAGS += --no-print-directory -s
ACLOCAL_AMFLAGS = -I m4

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
	src/js-misc.c \
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

src/resources.c: src/resources.xml
	glib-compile-resources --target=$@ --sourcedir $(top_srcdir) --generate-source $<

src/resources.xml: $(jsfiles)
	$(srcdir)/resources.sh $(top_srcdir) > $@

# {{{ docs

MAN1 = megadf megadl megaget megals megamkdir megaput megareg megarm megamv megasync megafs
MAN5 = megarc
MAN7 = megatools

man1_MANS = $(addprefix docs/,$(addsuffix .1, $(MAN1)))
man5_MANS = $(addprefix docs/,$(addsuffix .5, $(MAN5)))
man7_MANS = $(addprefix docs/,$(addsuffix .7, $(MAN7)))

MANS_ALL = $(man1_MANS) $(man5_MANS) $(man7_MANS)

BUILT_SOURCES += $(MANS_ALL)

EXTRA_DIST += \
	docs/asciidoc.conf \
	docs/footer.txt \
	docs/remote-paths.txt \
	docs/shared-options.txt \
	$(man1_MANS:.1=.txt) \
	$(man5_MANS:.5=.txt) \
	$(man7_MANS:.7=.txt) \
	$(MANS_ALL)

if ENABLE_DOCS_BUILD

DISTCLEANFILES += $(MANS_ALL)

%.1 %.5 %.7: %.txt docs/shared-options.txt docs/remote-paths.txt docs/footer.txt docs/asciidoc.conf
	$(AM_V_GEN)a2x --asciidoc-opts="-f docs/asciidoc.conf" -f manpage $<
	@sed -i 's/\[FIXME: manual]/Megatools Manual/' $@
	@sed -i 's/\[FIXME: source]/megatools $(VERSION)/' $@

else

%.1 %.5 %.7:
	@echo You need to use --enable-docs-build if building from git tree
	@false

endif

EXTRA_DIST += LICENSE HACKING

doc_DATA = LICENSE NEWS TODO README INSTALL HACKING

# }}}

export MAKEFLAGS += --no-print-directory -s
ACLOCAL_AMFLAGS = -I m4

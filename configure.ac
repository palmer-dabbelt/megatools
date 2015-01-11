AC_PREREQ(2.60)
AC_INIT([megatools],[2.0.0],[megous@megous.com],[megatools])
AC_CONFIG_SRCDIR([Makefile.am])
AC_CONFIG_MACRO_DIR([m4])
AC_CONFIG_HEADER([config.h])
AM_INIT_AUTOMAKE([silent-rules foreign subdir-objects -Wno-portability])
AM_MAINTAINER_MODE
AM_SILENT_RULES([yes])

AC_PROG_CC
AM_PROG_CC_C_O
AC_LIBTOOL_WIN32_DLL
AM_PROG_LIBTOOL
AC_HEADER_STDC
AC_PATH_PROG(RE2C, re2c)

# Define requirements

GLIB_VERSION="2.32.0"
NETTLE_REQUIRES="nettle >= 2.7 hogweed >= 2.7"
FUSE_REQUIRES="fuse"
NCURSES_REQUIRES="ncurses"

# check for glib/gio
AM_PATH_GLIB_2_0([$GLIB_VERSION],,AC_MSG_ERROR([Glib $GLIB_VERSION or later is required to build megatools]),[gobject gio])
GLIB_MAKEFILE='$(top_srcdir)/Makefile.glib'
AC_SUBST(GLIB_MAKEFILE)

# check for gmp
AC_CHECK_LIB(gmp,__gmpz_init,, [AC_MSG_ERROR([GNU MP not found, see http://swox.com/gmp])])

# check nettle
PKG_CHECK_MODULES(NETTLE, [$NETTLE_REQUIRES])
AC_SUBST(NETTLE_CFLAGS)
AC_SUBST(NETTLE_LIBS)

# check ncurses
AC_ARG_WITH([ncurses],
  AS_HELP_STRING([--without-ncurses], [Ignore presence of ncurses and disable it]))

AS_IF([test "x$with_ncurses" != "xno"],
  [PKG_CHECK_MODULES(NCURSES, [$NCURSES_REQUIRES], [ENABLE_NCURSES=yes], [ENABLE_NCURSES=no])],
  [ENABLE_NCURSES=no])

AS_IF([test "x$ENABLE_NCURSES" = "xyes"],
  [
    AC_SUBST(NCURSES_CFLAGS)
    AC_SUBST(NCURSES_LIBS)
    AC_DEFINE(HAVE_NCURSES, 1, [Enable nurses])
  ],
    [AS_IF([test "x$with_ncurses" = "xyes"],
      [AC_MSG_ERROR([ncurses support requested but not found])
    ])
])

AM_CONDITIONAL([ENABLE_NCURSES], [test "x$ENABLE_NCURSES" = "xyes"])

# check fuse
AC_ARG_WITH([fuse],
  AS_HELP_STRING([--without-fuse], [Ignore presence of fuse and disable it]))

AS_IF([test "x$with_fuse" != "xno"],
  [PKG_CHECK_MODULES(FUSE, [$FUSE_REQUIRES], [ENABLE_FUSE=yes], [ENABLE_FUSE=no])],
  [ENABLE_FUSE=no])

AS_IF([test "x$ENABLE_FUSE" = "xyes"],
  [
    AC_SUBST(FUSE_CFLAGS)
    AC_SUBST(FUSE_LIBS)
  ],
    [AS_IF([test "x$with_fuse" = "xyes"],
      [AC_MSG_ERROR([fuse support requested but not found])
    ])
])

AM_CONDITIONAL([ENABLE_FUSE], [test "x$ENABLE_FUSE" = "xyes"])

# enable dev compiler warnings
AC_ARG_ENABLE([warnings], AC_HELP_STRING([--enable-warnings], [Build with compiler warnings enabled.]))
AS_IF([test "x$enable_warnings" = "xyes"], [
  CFLAGS="$CFLAGS -Wall -Wextra -Wno-unused-parameter -Wno-unused-variable -Wno-unused-local-typedefs -Wno-unused-function -Wno-sign-compare -Wno-pointer-sign -Wno-missing-field-initializers"

  AS_IF([$CC --version | head -n1 | grep '(GCC) 4\.8' &>/dev/null], [CFLAGS="$CFLAGS -Wno-unused-local-typedefs"])
], [
  CFLAGS="$CFLAGS -Wno-pointer-sign -Wno-unused-variable"
  enable_warnings=no
])

AC_CONFIG_FILES([
  Makefile
])

AC_OUTPUT

cat << EOF

Configured features:

  warnings: $enable_warnings
  color support: $ENABLE_NCURSES (requires ncurses)
  FUSE support: $ENABLE_FUSE (requires fuse)

Run make now.

NOTE: On FreeBSD, you need to use GNU make (gmake)

EOF

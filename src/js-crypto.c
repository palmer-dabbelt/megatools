#include <glib.h>
#include "crypto.h"
#include "alloc.h"

#include "js-crypto.h"

static guchar* make_request_id(void)
{
	const gchar chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	gchar k[11] = {0};
	gint i;

	for (i = 0; i < 10; i++)
		k[i] = chars[rand() % sizeof(chars)];

	return g_strdup(k);
}

static int js_make_request_id(duk_context *ctx) 
{
	gc_free gchar* rid = make_request_id();
	duk_push_string(ctx, rid);
	return 1;
}

static int js_random(duk_context *ctx)
{
	duk_uint_t size = duk_require_uint(ctx, 0);
	guchar* buf = duk_push_fixed_buffer(ctx, size);
	crypto_randomness(buf, size);
	return 1;
}

static int js_ub64enc(duk_context *ctx)
{
	duk_size_t len;
	guchar* buf = duk_require_buffer(ctx, 0, &len);

	gchar* str = crypto_base64urlencode(buf, len);
	duk_push_string(ctx, str);
	return 1;
}

static int js_ub64dec(duk_context *ctx)
{
	const gchar* str = duk_require_string(ctx, 0);
	gsize len;
	gc_free guchar* buf = crypto_base64urldecode(str, &len);
	if (!buf)
		return 0;

	guchar* dukbuf = duk_push_fixed_buffer(ctx, len);
	memcpy(dukbuf, buf, len);
	return 1;
}

static int js_aes_enc(duk_context *ctx)
{
	duk_size_t key_size, in_size;
	guchar* key = duk_require_buffer(ctx, 0, &key_size);
	guchar* in = duk_require_buffer(ctx, 1, &in_size);

	if (key_size != 16)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "key size must be 16, is %d", (int)key_size);
	if (in_size % 16 != 0 || in_size == 0)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "input size must be a multiple of 16, is %d", (int)in_size);

	guchar* out = duk_push_fixed_buffer(ctx, in_size);
	crypto_aes_enc(key, in, out, in_size);
	return 1;
}

static int js_aes_dec(duk_context *ctx)
{
	duk_size_t key_size, in_size;
	guchar* key = duk_require_buffer(ctx, 0, &key_size);
	guchar* in = duk_require_buffer(ctx, 1, &in_size);

	if (key_size != 16)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "key size must be 16, is %d", (int)key_size);
	if (in_size % 16 != 0 || in_size == 0)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "input size must be a multiple of 16, is %d", (int)in_size);

	guchar* out = duk_push_fixed_buffer(ctx, in_size);
	crypto_aes_dec(key, in, out, in_size);
	return 1;
}

static int js_aes_enc_cbc(duk_context *ctx)
{
	duk_size_t key_size, in_size;
	guchar* key = duk_require_buffer(ctx, 0, &key_size);
	guchar* in = duk_require_buffer(ctx, 1, &in_size);

	if (key_size != 16)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "key size must be 16, is %d", (int)key_size);
	if (in_size % 16 != 0 || in_size == 0)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "input size must be a multiple of 16, is %d", (int)in_size);

	guchar* out = duk_push_fixed_buffer(ctx, in_size);
	crypto_aes_enc_cbc(key, in, out, in_size);
	return 1;
}

static int js_aes_dec_cbc(duk_context *ctx)
{
	duk_size_t key_size, in_size;
	guchar* key = duk_require_buffer(ctx, 0, &key_size);
	guchar* in = duk_require_buffer(ctx, 1, &in_size);

	if (key_size != 16)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "key size must be 16, is %d", (int)key_size);
	if (in_size % 16 != 0 || in_size == 0)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "input size must be a multiple of 16, is %d", (int)in_size);

	guchar* out = duk_push_fixed_buffer(ctx, in_size);
	crypto_aes_dec_cbc(key, in, out, in_size);
	return 1;
}

static int js_aes_ctr(duk_context *ctx)
{
	duk_size_t key_size, in_size, nonce_size;
	guchar* key = duk_require_buffer(ctx, 0, &key_size);
	guchar* nonce = duk_require_buffer(ctx, 1, &nonce_size);
	guint position = duk_require_uint(ctx, 2);
	guchar* in = duk_require_buffer(ctx, 3, &in_size);

	if (key_size != 16)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "key size must be 16, is %u", (unsigned)key_size);
	if (nonce_size != 8)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "key size must be 16, is %u", (unsigned)key_size);
	if (in_size == 0)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "input size must be > 0, is %u", (unsigned)in_size);

	guchar* out = duk_push_fixed_buffer(ctx, in_size);
	crypto_aes_enc_ctr(key, nonce, position, in, out, in_size);
	return 1;
}

static int js_aes_cbc_mac(duk_context* ctx)
{
	duk_size_t key_len, nonce_len, data_len;
	guchar* key = duk_require_buffer(ctx, 0, &key_len);
	guchar* nonce = duk_require_buffer(ctx, 1, &nonce_len);
	guchar* data = duk_require_buffer(ctx, 2, &data_len);

        if (key_len != 16)
		duk_error(ctx, DUK_ERR_API_ERROR, "Key size must be 16");
        if (nonce_len != 16)
		duk_error(ctx, DUK_ERR_API_ERROR, "Nonce size must be 16");

        guchar* mac = duk_push_fixed_buffer(ctx, 16);

	crypto_aes_cbc_mac(key, nonce, data, data_len, mac);
	return 1;
}

static int js_aes_key_from_password(duk_context *ctx)
{
	const gchar* str = duk_require_string(ctx, 0);

	guchar* out = duk_push_fixed_buffer(ctx, 16);
	crypto_aes_key_from_password(str, out);
	return 1;
}

static int js_aes_key_random(duk_context *ctx)
{
	guchar* buf = duk_push_fixed_buffer(ctx, 16);
	crypto_randomness(buf, 16);
	return 1;
}

static int js_make_username_hash(duk_context *ctx)
{
	duk_size_t key_size;
	guchar* key = duk_require_buffer(ctx, 0, &key_size);
	const gchar* un = duk_require_string(ctx, 1);

	if (key_size != 16)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "key size must be 16, is %d", (int)key_size);

	gc_free gchar* hash = crypto_make_username_hash(key, un);
	duk_push_string(ctx, hash);
	return 1;
}

static int js_rsa_encrypt(duk_context* ctx)
{
	duk_size_t plain_size;
	const gchar* pubk = duk_require_string(ctx, 0);
	guchar* plain = duk_require_buffer(ctx, 1, &plain_size);

	if (plain_size > 512)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "rsa plain size too big: %u", (unsigned)plain_size);

	gc_bytes_unref GBytes* cipher = crypto_rsa_encrypt(pubk, plain, plain_size);
	guchar* out = duk_push_fixed_buffer(ctx, g_bytes_get_size(cipher));
	memcpy(out, g_bytes_get_data(cipher, NULL), g_bytes_get_size(cipher));
	return 1;
}

static int js_rsa_decrypt(duk_context* ctx)
{
	duk_size_t privk_enc_size, cipher_size;
	const gchar* pubk = duk_get_string(ctx, 0);
	const gchar* privk = duk_require_string(ctx, 1);
	const guchar* privk_enc = duk_require_buffer(ctx, 2, &privk_enc_size);
	const guchar* cipher = duk_require_buffer(ctx, 3, &cipher_size);

	if (privk_enc_size != 16)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "key size must be 16, is %d", (int)privk_enc_size);

	gc_bytes_unref GBytes* plain = crypto_rsa_decrypt(pubk, privk, privk_enc, cipher, cipher_size);
	guchar* out = duk_push_fixed_buffer(ctx, g_bytes_get_size(plain));
	memcpy(out, g_bytes_get_data(plain, NULL), g_bytes_get_size(plain));
	return 1;
}

static int js_rsa_decrypt_sid(duk_context* ctx)
{
	duk_size_t privk_enc_size, cipher_size;
	const gchar* privk = duk_require_string(ctx, 0);
	const guchar* privk_enc = duk_require_buffer(ctx, 1, &privk_enc_size);
	const guchar* csid = duk_require_string(ctx, 2);

	if (privk_enc_size != 16)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "key size must be 16, is %d", (int)privk_enc_size);

	gc_free gchar* sid = crypto_rsa_decrypt_sid(privk, privk_enc, csid);
	duk_push_string(ctx, sid);
	return 1;
}

static int js_rsa_generate(duk_context* ctx)
{
	duk_size_t privk_enc_size;
	gc_free gchar* pubk = NULL, *privk = NULL;
	const guchar* privk_enc = duk_require_buffer(ctx, 0, &privk_enc_size);

	if (privk_enc_size != 16)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "key size must be 16, is %d", (int)privk_enc_size);

	crypto_rsa_key_generate(privk_enc, &privk, &pubk);

	duk_push_object(ctx);
	duk_push_string(ctx, pubk);
	duk_put_prop_string(ctx, -2, "pubk");
	duk_push_string(ctx, privk);
	duk_put_prop_string(ctx, -2, "privk");
	return 1;
}

static int js_rsa_export(duk_context* ctx)
{
	duk_size_t privk_enc_size;
	const gchar* pubk = duk_require_string(ctx, 0);
	const gchar* privk = duk_require_string(ctx, 1);
	const guchar* privk_enc = duk_require_buffer(ctx, 2, &privk_enc_size);

	if (privk_enc_size != 16)
		duk_error(ctx, DUK_ERR_RANGE_ERROR, "key size must be 16, is %d", (int)privk_enc_size);

	gc_free gchar* json = crypto_rsa_export(pubk, privk, privk_enc);
	duk_push_string(ctx, json);
	duk_json_decode(ctx, -1);
	return 1;
}

static const duk_function_list_entry module_funcs[] = 
{
	{ "random", js_random, 1 },
	{ "ub64enc", js_ub64enc, 1 },
	{ "ub64dec", js_ub64dec, 1 },
	{ "aes_enc", js_aes_enc, 2 },
	{ "aes_dec", js_aes_dec, 2 },
	{ "aes_enc_cbc", js_aes_enc_cbc, 2 },
	{ "aes_dec_cbc", js_aes_dec_cbc, 2 },
	{ "aes_ctr", js_aes_ctr, 4 },
	{ "aes_key_from_password", js_aes_key_from_password, 1 },
	{ "aes_key_random", js_aes_key_random, 0 },
	{ "aes_cbc_mac", js_aes_cbc_mac, 3 },
	{ "make_username_hash", js_make_username_hash, 2 },
	{ "make_request_id", js_make_request_id, 0 },
	{ "rsa_encrypt", js_rsa_encrypt, 2 },
	{ "rsa_decrypt", js_rsa_decrypt, 4 },
	{ "rsa_decrypt_sid", js_rsa_decrypt_sid, 3 },
	{ "rsa_generate", js_rsa_generate, 1 },
	{ "rsa_export", js_rsa_export, 3 },
	{ NULL, NULL, 0 }
};

void js_crypto_init(duk_context* ctx)
{
	duk_put_function_list(ctx, -1, module_funcs);
}

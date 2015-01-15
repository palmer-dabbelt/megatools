#include <string.h>
#include <nettle/aes.h>
#include <nettle/cbc.h>
#include <nettle/ctr.h>
#include <nettle/rsa.h>
#include <nettle/yarrow.h>
#include <glib/gstdio.h>
#include <stdlib.h>
#ifdef G_OS_WIN32
#include <windows.h>
#include <wincrypt.h>
#endif
#include "crypto.h"
#include "alloc.h"
#include "sjson.h"

// {{{ ub64

/**
 * Encode buffer to Base64 and replace + with -, / with _ and remove trailing =.
 */
gchar* crypto_base64urlencode(const guchar* data, gsize len)
{
	gchar *out, *p;

	g_return_val_if_fail(data != NULL, NULL);
	g_return_val_if_fail(len > 0, NULL);

	out = g_base64_encode(data, len);

	for (p = out; *p != '\0'; p++) {
		if (*p == '+')
			*p = '-';
		else if (*p == '/')
			*p = '_';
		else if (*p == '=') {
			*p = '\0';
			break;
		}
	}

	return out;
}

/**
 * Decode string encoded with #crypto_base64urlencode.
 */
guchar* crypto_base64urldecode(const gchar* str, gsize* len)
{
	GString* s;
	gint i;

	g_return_val_if_fail(str != NULL, NULL);
	g_return_val_if_fail(len != NULL, NULL);

	s = g_string_new(str);

	for (i = 0; i < s->len; i++) {
		if (s->str[i] == '-')
			s->str[i] = '+';
		else if (s->str[i] == '_')
			s->str[i] = '/';
	}

	gint eqs = (s->len * 3) & 0x03;
	for (i = 0; i < eqs; i++)
		g_string_append_c(s, '=');

	g_base64_decode_inplace(s->str, len);

	return g_string_free(s, FALSE);
}

// }}}
// {{{ utils

/**
 * Initialize key from plaintext password string. (Mega.co.nz algorithm)
 */
void crypto_aes_key_from_password(const gchar* password, guchar key_out[16])
{
	g_return_if_fail(key_out != NULL);
	g_return_if_fail(password != NULL);

	guchar pkey[AES_BLOCK_SIZE] = {0x93, 0xC4, 0x67, 0xE3, 0x7D, 0xB0, 0xC7, 0xA4, 0xD1, 0xBE, 0x3F, 0x81, 0x01, 0x52, 0xCB, 0x56};
	gint off, r;
	gint len;

	len = strlen(password);

	for (r = 65536; r--; ) {
		for (off = 0; off < len; off += AES_BLOCK_SIZE) {
			struct aes_ctx k;
			guchar key[AES_BLOCK_SIZE] = {0};
			strncpy(key, password + off, AES_BLOCK_SIZE);

			aes_set_encrypt_key(&k, AES_BLOCK_SIZE, key);
			aes_encrypt(&k, AES_BLOCK_SIZE, pkey, pkey);  
		}
	}

	memcpy(key_out, pkey, AES_BLOCK_SIZE);
}

/**
 * Generate username hash (uh paraemter for 'us' API call) used for authentication to Mega.co.nz.
 */
gchar* crypto_make_username_hash(const guchar* key, const gchar* username)
{
	gchar* username_lower;
	struct aes_ctx ctx;

	g_return_if_fail(key != NULL);
	g_return_val_if_fail(username != NULL, NULL);

	aes_set_encrypt_key(&ctx, 16, key);

	username_lower = g_ascii_strdown(username, -1);

	gint l, i;
	guchar hash[AES_BLOCK_SIZE] = {0}, oh[8];

	for (i = 0, l = strlen(username_lower); i < l; i++) 
		hash[i % AES_BLOCK_SIZE] ^= username_lower[i];

	for (i = 16384; i--; ) 
		aes_encrypt(&ctx, AES_BLOCK_SIZE, hash, hash);  

	memcpy(oh, hash, 4);
	memcpy(oh + 4, hash + 8, 4);

	g_free(username_lower);

	return crypto_base64urlencode(oh, 8);
}

// }}}
// {{{ aes

/**
 * Encrypt plaintext blocks using AES key
 */
void crypto_aes_enc(const guchar* key, const guchar* plain, guchar* cipher, gsize len)
{
	g_return_if_fail(key != NULL);
	g_return_if_fail(plain != NULL);
	g_return_if_fail(cipher != NULL);
	g_return_if_fail(len % AES_BLOCK_SIZE == 0);
	g_return_if_fail(len > 0);

	struct aes_ctx ctx;

	aes_set_encrypt_key(&ctx, 16, key);
	aes_encrypt(&ctx, len, cipher, plain);
}

/**
 * Decrypt ciphertext blocks using AES key
 */
void crypto_aes_dec(const guchar* key, const guchar* cipher, guchar* plain, gsize len)
{
	g_return_if_fail(key != NULL);
	g_return_if_fail(cipher != NULL);
	g_return_if_fail(plain != NULL);
	g_return_if_fail(len % AES_BLOCK_SIZE == 0);
	g_return_if_fail(len > 0);

	struct aes_ctx ctx;

	aes_set_decrypt_key(&ctx, 16, key);
	aes_decrypt(&ctx, len, plain, cipher);
}

/**
 * Encrypt plaintext blocks using AES key in CBC mode with zero IV
 */
void crypto_aes_enc_cbc(const guchar* key, const guchar* plain, guchar* cipher, gsize len)
{
	guchar iv[AES_BLOCK_SIZE] = {0};

	g_return_if_fail(key != NULL);
	g_return_if_fail(plain != NULL);
	g_return_if_fail(cipher != NULL);
	g_return_if_fail((len % AES_BLOCK_SIZE) == 0);
	g_return_if_fail(len > 0);

	struct aes_ctx ctx;

	aes_set_encrypt_key(&ctx, 16, key);
	cbc_encrypt(&ctx, (nettle_crypt_func*)aes_encrypt, AES_BLOCK_SIZE, iv, len, cipher, plain);
}

/**
 * Decrypt ciphertext blocks using AES key in CBC mode with zero IV
 */
void crypto_aes_dec_cbc(const guchar* key, const guchar* cipher, guchar* plain, gsize len)
{
	guchar iv[AES_BLOCK_SIZE] = {0};

	g_return_if_fail(key != NULL);
	g_return_if_fail(cipher != NULL);
	g_return_if_fail(plain != NULL);
	g_return_if_fail((len % AES_BLOCK_SIZE) == 0);
	g_return_if_fail(len > 0);

	struct aes_ctx ctx;

	aes_set_decrypt_key(&ctx, 16, key);
	cbc_decrypt(&ctx, (nettle_crypt_func*)aes_decrypt, AES_BLOCK_SIZE, iv, len, plain, cipher);
}

/**
 * Encrypt plaintext blocks using AES key in CTR mode.
 */
void crypto_aes_enc_ctr(const guchar* key, guchar* nonce, guint64 position, const guchar* from, guchar* to, gsize len)
{
	g_return_if_fail(key != NULL);
	g_return_if_fail(nonce != NULL);
	g_return_if_fail(from != NULL);
	g_return_if_fail(to != NULL);
	g_return_if_fail(len > 0);

	struct aes_ctx ctx;

	// for ctr
	union {
		guchar iv[16];
		struct {
			guchar nonce[8];
			guint64 position;
		};
	} ctr;

	aes_set_encrypt_key(&ctx, 16, key);
	memcpy(ctr.nonce, nonce, 8);
	ctr.position = GUINT64_TO_BE(position);

	ctr_crypt(&ctx, (nettle_crypt_func*)aes_encrypt, AES_BLOCK_SIZE, ctr.iv, len, to, from);
}

void crypto_aes_cbc_mac(const guchar* key, const guchar* nonce, const guchar* data, gsize len, guchar* mac)
{
	struct aes_ctx ctx;
	gsize i, j, rem;

	aes_set_encrypt_key(&ctx, 16, key);
	memcpy(mac, nonce, 16);

	for (i = 0; i < len / 16; i++) {
		for (j = 0; j < 16; j++) {
			mac[j] ^= data[i * 16 + j];
		}

		aes_encrypt(&ctx, 16, mac, mac);
	}

	rem = len % 16;
	if (rem) {
		for (j = 0; j < rem; j++) {
			mac[j] ^= data[i * 16 + j];
		}

		aes_encrypt(&ctx, 16, mac, mac);
	}
}

// }}}
// {{{ rsa

// for use in nettle funcs
static void randomness_nettle(gpointer ctx, guint len, guchar* buffer)
{
	crypto_randomness(buffer, len);
}

#define MPI_SET_BITS(ptr, bits) *(guint16*)(ptr) = GUINT16_TO_BE(bits)
#define MPI_BITS(ptr) GUINT16_FROM_BE(*(guint16*)(ptr))
#define MPI_BYTES(ptr) ((MPI_BITS(ptr) + 7) / 8)
#define MPI_SIZE(ptr) (MPI_BYTES(ptr) + MPI_HDRSIZE)
#define MPI_HDRSIZE 2

static void write_mpi(GString* buf, mpz_t n)
{
	g_return_if_fail(buf != NULL);
	g_return_if_fail(n != NULL);

	gsize size_bits = mpz_sizeinbase(n, 2);
	gsize size = (size_bits + 7) / 8;
	gsize off = buf->len;

	g_string_set_size(buf, buf->len + size + MPI_HDRSIZE);

	MPI_SET_BITS(buf->str + off, size_bits);
	mpz_export(buf->str + off + MPI_HDRSIZE, NULL, 1, 1, 1, 0, n);
}

static gboolean read_mpi(const guchar* buf, const guchar* end, const guchar** next, mpz_t n)
{
	gsize size;

	g_return_val_if_fail(buf != NULL, FALSE);
	g_return_val_if_fail(end != NULL, FALSE);
	g_return_val_if_fail(n != NULL, FALSE);

	if (end - buf < 2)
		return FALSE;

	size = MPI_SIZE(buf);
	if (end - buf < size)
		return FALSE;

	mpz_import(n, MPI_BYTES(buf), 1, 1, 1, 0, buf + MPI_HDRSIZE);

	if (next)
		*next = buf + size;

	return TRUE;
}

static void decrypt_rsa(mpz_t r, mpz_t m, mpz_t d, mpz_t p, mpz_t q, mpz_t u)
{
	mpz_t xp, mod_mp, mod_dp1, p1, xq, mod_mq, mod_dq1, q1, t;

	g_return_if_fail(r != NULL);
	g_return_if_fail(m != NULL);
	g_return_if_fail(d != NULL);
	g_return_if_fail(p != NULL);
	g_return_if_fail(q != NULL);
	g_return_if_fail(u != NULL);

	mpz_inits(xp, mod_mp, mod_dp1, p1, xq, mod_mq, mod_dq1, q1, t, NULL);

	// var xp = bmodexp(bmod(m,p), bmod(d,bsub(p,[1])), p);
	mpz_mod(mod_mp, m, p);
	mpz_sub_ui(p1, p, 1);
	mpz_mod(mod_dp1, d, p1);
	mpz_powm(xp, mod_mp, mod_dp1, p);

	// var xq = bmodexp(bmod(m,q), bmod(d,bsub(q,[1])), q);
	mpz_mod(mod_mq, m, q);
	mpz_sub_ui(q1, q, 1);
	mpz_mod(mod_dq1, d, q1);
	mpz_powm(xq, mod_mq, mod_dq1, q);

	// var t = bsub(xq,xp);
	if (mpz_cmp(xq, xp) <= 0) {
		mpz_sub(t, xp, xq);
		mpz_mul(r, t, u);
		mpz_mod(t, r, q);
		mpz_sub(t, q, t);
	} else {
		mpz_sub(t, xq, xp);
		mpz_mul(r, t, u);
		mpz_mod(t, r, q);
	}

	mpz_mul(r, t, p);
	mpz_add(r, r, xp);

	mpz_clears(xp, mod_mp, mod_dp1, p1, xq, mod_mq, mod_dq1, q1, t, NULL);
}

static void encrypt_rsa(mpz_t r, mpz_t s, mpz_t e, mpz_t m)
{
	g_return_if_fail(r != NULL);
	g_return_if_fail(s != NULL);
	g_return_if_fail(e != NULL);
	g_return_if_fail(m != NULL);

	mpz_powm(r, s, e, m);
}

struct rsa_key
{
	gboolean pubk_loaded;
	gboolean privk_loaded;
	mpz_t p;
	mpz_t q;
	mpz_t d;
	mpz_t u; // p^-1 mod q
	mpz_t m;
	mpz_t e;
};

static struct rsa_key* rsa_key_new(void)
{
	return g_new0(struct rsa_key, 1);
}

static void rsa_key_free(struct rsa_key* key)
{
	if (key) {
		mpz_clears(key->p, key->q, key->d, key->u, key->m, key->e, NULL);
		g_free(key);
	}
}

DEFINE_CLEANUP_FUNCTION_NULL(struct rsa_key*, rsa_key_free)
#define gc_rsa_key_free CLEANUP(rsa_key_free)

static gboolean rsa_key_load_pubk(struct rsa_key* key, const gchar* pubk, gsize pubk_len)
{
	const guchar *start, *end;

	g_return_val_if_fail(key != NULL, FALSE);
	g_return_val_if_fail(pubk != NULL, FALSE);
	g_return_val_if_fail(pubk_len > 0, FALSE);

	start = pubk;
	end = start + pubk_len;

	return
		read_mpi(start, end, &start, key->m)
		&& read_mpi(start, end, &start, key->e);
}

static gboolean rsa_key_load_privk(struct rsa_key* key, const gchar* privk, gsize privk_len)
{
	const guchar *start, *end;

	g_return_val_if_fail(key != NULL, FALSE);
	g_return_val_if_fail(privk != NULL, FALSE);
	g_return_val_if_fail(privk_len > 0, FALSE);

	start = privk;
	end = start + privk_len;

	return 
		read_mpi(start, end, &start, key->p)
		&& read_mpi(start, end, &start, key->q)
		&& read_mpi(start, end, &start, key->d)
		&& read_mpi(start, end, &start, key->u);
}

static struct rsa_key* rsa_key_load(const gchar* pubk, const gchar* privk, const guchar* privk_enc_key)
{
	gsize pubk_len = 0, privk_len = 0;
	gc_free guchar* pubk_raw = NULL, *privk_raw = NULL;

	if (pubk) {
		pubk_raw = crypto_base64urldecode(pubk, &pubk_len);
		if (pubk_raw == NULL) {
			return NULL;
		}
	}

	if (privk) {
		privk_raw = crypto_base64urldecode(privk, &privk_len);
		if (privk_raw == NULL)
			return NULL;
	}

	if (privk_raw && privk_enc_key) {
		crypto_aes_dec(privk_enc_key, privk_raw, privk_raw, privk_len);
	}

	struct rsa_key* key = rsa_key_new();

	if (pubk_raw) {
		if (rsa_key_load_pubk(key, pubk_raw, pubk_len)) {
			key->pubk_loaded = TRUE;
		} else {
			rsa_key_free(key);
			return NULL;
		}
	}

	if (privk_raw) {
		if (rsa_key_load_privk(key, privk_raw, privk_len)) {
			key->privk_loaded = TRUE;
		} else {
			rsa_key_free(key);
			return NULL;
		}
	}

	return key;
}

static gchar* rsa_key_get_pubk(struct rsa_key* key)
{
	g_return_val_if_fail(key != NULL, NULL);

	gc_string_free GString* data = g_string_sized_new(128 * 3);

	write_mpi(data, key->m);
	write_mpi(data, key->e);

	return crypto_base64urlencode(data->str, data->len);
}

static gchar* rsa_key_get_privk(struct rsa_key* key, const guchar* enc_key)
{
	gc_string_free GString* data = NULL;
	gchar* str;
	gsize off, pad;

	g_return_val_if_fail(key != NULL, NULL);

	data = g_string_sized_new(128 * 7);

	write_mpi(data, key->p);
	write_mpi(data, key->q);
	write_mpi(data, key->d);
	write_mpi(data, key->u);

	// add random padding
	off = data->len;
	pad = data->len % 16 ? 16 - (data->len % 16) : 0;
	if (pad) {
		g_string_set_size(data, data->len + pad);
		crypto_randomness(data->str + off, pad);
	}

	// encrypt
	if (enc_key)
		crypto_aes_enc(enc_key, data->str, data->str, data->len);

	return crypto_base64urlencode(data->str, data->len);
}

static GBytes* rsa_key_encrypt(struct rsa_key* key, const guchar* data, gsize len)
{
	mpz_t c, m;
	guchar* message;
	gsize message_length;
	GString* cipher_mpi;
	gchar* str;

	g_return_val_if_fail(key != NULL, NULL);
	g_return_val_if_fail(data != NULL, NULL);
	g_return_val_if_fail(len > 0, NULL);

	message_length = (mpz_sizeinbase(key->m, 2) >> 3) - 1;

	// check that data fits the message
	g_return_val_if_fail(len <= message_length, NULL);

	// create random padded message from data
	message = g_malloc0(message_length);
	memcpy(message, data, len);
	crypto_randomness(message + len, message_length - len);
	mpz_init(m);
	mpz_import(m, message_length, 1, 1, 1, 0, message);
	g_free(message);

	// encrypt mesasge
	mpz_init(c);
	encrypt_rsa(c, m, key->e, key->m);
	mpz_clear(m);

	// encode result as MPI
	cipher_mpi = g_string_sized_new(256);
	write_mpi(cipher_mpi, c);
	mpz_clear(c);

	return g_string_free_to_bytes(cipher_mpi);
}

static GBytes* rsa_key_decrypt(struct rsa_key* key, const guchar* cipher, gsize len)
{
	guchar* data;
	gssize message_length;
	gsize m_size_bits, m_size;
	mpz_t c, m;

	g_return_val_if_fail(key != NULL, NULL);
	g_return_val_if_fail(cipher != NULL, NULL);

	if (key->pubk_loaded)
		message_length = (mpz_sizeinbase(key->m, 2) >> 3) - 1;
	else
		message_length = -1;

	mpz_init(c);
	if (!read_mpi(cipher, cipher + len, NULL, c))
		return NULL;

	mpz_init(m);
	decrypt_rsa(m, c, key->d, key->p, key->q, key->u);
	mpz_clear(c);

	m_size_bits = mpz_sizeinbase(m, 2);
	m_size = (m_size_bits + 7) / 8;

	if (message_length < 0)
		message_length = m_size;

	// message doesn't fit message length of the original
	if (message_length < m_size) {
		mpz_clear(m);
		return NULL;
	}

	data = g_malloc0(message_length);

	// align decoded data to the right side of the message buffer (Mega doesn't do
	// this)
	mpz_export(data + (message_length - m_size), NULL, 1, 1, 1, 0, m);
	mpz_clear(m);

	return g_bytes_new_take(data, message_length);
}

static struct rsa_key* rsa_key_generate(void)
{
	struct rsa_public_key pubk;
	struct rsa_private_key privk;

	rsa_private_key_init(&privk);
	rsa_public_key_init(&pubk);

	mpz_set_ui(pubk.e, 3);

	if (!rsa_generate_keypair(&pubk, &privk, NULL, randomness_nettle, NULL, NULL, 2048, 0)) {
		rsa_private_key_clear(&privk);
		rsa_public_key_clear(&pubk);
		return FALSE;
	}

	struct rsa_key* key = rsa_key_new();

	mpz_set(key->p, privk.q);
	mpz_set(key->q, privk.p);
	mpz_set(key->d, privk.d);
	mpz_set(key->u, privk.c);

	mpz_set(key->m, pubk.n);
	mpz_set(key->e, pubk.e);

	rsa_private_key_clear(&privk);
	rsa_public_key_clear(&pubk);

	return key;
}

gboolean crypto_rsa_key_generate(const guchar* privk_enc_key, gchar** privk, gchar** pubk)
{
	g_return_val_if_fail(privk != NULL, FALSE);
	g_return_val_if_fail(pubk != NULL, FALSE);

	gc_rsa_key_free struct rsa_key* key = rsa_key_generate();

	if (!key)
		return FALSE;

	*pubk = rsa_key_get_pubk(key);
	*privk = rsa_key_get_privk(key, privk_enc_key);

	return TRUE;
}

GBytes* crypto_rsa_encrypt(const gchar* pubk, const guchar* plain, gsize len)
{
	g_return_val_if_fail(pubk != NULL, NULL);

	gc_rsa_key_free struct rsa_key* key = rsa_key_load(pubk, NULL, NULL);
	if (!key)
		return NULL;

	return rsa_key_encrypt(key, plain, len);
}

GBytes* crypto_rsa_decrypt(const gchar* pubk, const gchar* privk, const guchar* privk_enc_key, const guchar* cipher, gsize len)
{
	g_return_val_if_fail(privk != NULL, NULL);
	g_return_val_if_fail(privk_enc_key != NULL, NULL);

	gc_rsa_key_free struct rsa_key* key = rsa_key_load(pubk, privk, privk_enc_key);
	if (!key)
		return NULL;

	return rsa_key_decrypt(key, cipher, len);
}

gchar* crypto_rsa_decrypt_sid(const gchar* privk, const guchar* privk_enc_key, const gchar* csid)
{
	g_return_val_if_fail(privk != NULL, NULL);
	g_return_val_if_fail(privk_enc_key != NULL, NULL);
	g_return_val_if_fail(csid != NULL, NULL);

	gc_rsa_key_free struct rsa_key* key = rsa_key_load(NULL, privk, privk_enc_key);
	if (!key)
		return NULL;

	gsize csid_len = 0;
	gc_free guchar* csid_raw = crypto_base64urldecode(csid, &csid_len);
	if (csid_raw == NULL)
		return NULL;

	gc_bytes_unref GBytes* b = rsa_key_decrypt(key, csid_raw, csid_len);
	if (b && g_bytes_get_size(b) >= 43)
		return crypto_base64urlencode(g_bytes_get_data(b, NULL), 43);

	return NULL;
}

void s_json_gen_member_mpi(SJsonGen* g, const gchar* name, mpz_t n)
{
	char* str = mpz_get_str(NULL, 10, n);
	s_json_gen_member_string(g, name, str);
	free(str);
}

gchar* crypto_rsa_export(const gchar* pubk, const gchar* privk, const guchar* privk_enc_key)
{
	gc_rsa_key_free struct rsa_key* key = rsa_key_load(pubk, privk, privk_enc_key);
	if (!key)
		return NULL;

	SJsonGen* g = s_json_gen_new();
	s_json_gen_start_object(g);

	if (key->pubk_loaded) {
		s_json_gen_member_mpi(g, "m", key->m);
		s_json_gen_member_mpi(g, "e", key->e);
	} 

	if (key->privk_loaded) {
		s_json_gen_member_mpi(g, "p", key->p);
		s_json_gen_member_mpi(g, "q", key->q);
		s_json_gen_member_mpi(g, "d", key->d);
		s_json_gen_member_mpi(g, "u", key->u);
	} 

	s_json_gen_end_object(g);
	return s_json_gen_done(g);
}

// }}}
// {{{ randomness

G_LOCK_DEFINE_STATIC(yarrow);
static gboolean yarrow_ready = FALSE;
static struct yarrow256_ctx yarrow_ctx;

/**
 * Fill buffer with random data.
 */
void crypto_randomness(guchar* buffer, gsize len)
{
	guchar buf[YARROW256_SEED_FILE_SIZE];

	G_LOCK(yarrow);

	if (!yarrow_ready) {
		yarrow256_init(&yarrow_ctx, 0, NULL);

#ifdef G_OS_WIN32
		HCRYPTPROV hProvider;
		if (!CryptAcquireContextW(&hProvider, NULL, NULL, PROV_RSA_FULL, CRYPT_VERIFYCONTEXT))
			g_error("Failed to seed random generator");
		if (!CryptGenRandom(hProvider, sizeof(buf), buf))
			g_error("Failed to seed random generator");

		CryptReleaseContext(hProvider, 0); 
#else
		FILE* f = g_fopen("/dev/urandom", "r");
		if (!f)
			g_error("Failed to seed random generator");

		if (fread(buf, 1, sizeof(buf), f) != sizeof(buf))
			g_error("Failed to seed random generator");

		fclose(f);
#endif

		yarrow256_seed(&yarrow_ctx, YARROW256_SEED_FILE_SIZE, buf);
	}

	yarrow256_random(&yarrow_ctx, len, buffer);

	G_UNLOCK(yarrow);
}

// }}}

#ifndef __MEGATOOLS_CRYPTO_H__
#define __MEGATOOLS_CRYPTO_H__

#include <glib.h>

G_BEGIN_DECLS

gchar* crypto_base64urlencode(const guchar* data, gsize len);
guchar* crypto_base64urldecode(const gchar* str, gsize* len);

gchar* crypto_make_username_hash(const guchar* key, const gchar* username);
void crypto_aes_key_from_password(const gchar* password, guchar key_out[16]);

void crypto_aes_enc(const guchar* key, const guchar* plain, guchar* cipher, gsize len);
void crypto_aes_dec(const guchar* key, const guchar* cipher, guchar* plain, gsize len);
void crypto_aes_enc_cbc(const guchar* key, const guchar* plain, guchar* cipher, gsize len);
void crypto_aes_dec_cbc(const guchar* key, const guchar* cipher, guchar* plain, gsize len);
void crypto_aes_enc_ctr(const guchar* key, guchar* nonce, guint64 position, const guchar* from, guchar* to, gsize len);

gboolean crypto_rsa_key_generate(const guchar* privk_enc_key, gchar** privk, gchar** pubk);
GBytes* crypto_rsa_encrypt(const gchar* pubk, const guchar* plain, gsize len);
GBytes* crypto_rsa_decrypt(const gchar* pubk, const gchar* privk, const guchar* privk_enc_key, const guchar* cipher, gsize len);
gchar* crypto_rsa_decrypt_sid(const gchar* privk, const guchar* privk_enc_key, const gchar* csid);

void crypto_randomness(guchar* buffer, gsize len);

G_END_DECLS

#endif

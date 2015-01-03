GW.define('TestSuite.Crypto', 'TestSuite', {
	name: 'crypto',

	tests: [{
		name: 'ub64 enc',
		run: function() {
			var bin = Duktape.Buffer('1234567812345678');
			var b64ok = "MTIzNDU2NzgxMjM0NTY3OA";
			var b64 = C.ub64enc(bin);

			this.assertEq(b64, b64ok, 'b64 != b64ok');
			this.done();
		}
	}, {
		name: 'ub64 dec',
		run: function() {
			var b64 = "MTIzNDU2NzgxMjM0NTY3OA";
			var binok = Duktape.Buffer('1234567812345678');
			var bin = C.ub64dec(b64);

			this.assertEq(bin, binok, 'bin != binok');
			this.done();
		}
	}, {
		name: 'ub64 enc+dec',
		run: function() {
			var orig = Duktape.dec('hex', '00112233445566778899');
			var enc = C.ub64enc(orig);
			var dec = C.ub64dec(enc);

			this.assertEq(orig, dec, 'orig != dec');
			this.done();
		}
	}, {
		name: 'ub64 dec+enc',
		run: function() {
			var orig = "MTIzNDU2NzgxMjM0NTY3OA";
			var dec = C.ub64dec(orig);
			var enc = C.ub64enc(dec);

			this.assertEq(orig, enc, 'orig != enc');
			this.done();
		}
	}, {
		name: 'aes_key_from_password',
		run: function() {
			var pwd = C.aes_key_from_password("qwe");

			this.assertEq("b-9n_tUR0KApHfV6HmLcvg", C.ub64enc(pwd), 'pwdok != pwd');
			this.done();
		}
	}, {
		name: 'aes_key_random',
		run: function() {
			var k1 = C.aes_key_random();
			var k2 = C.aes_key_random();

			this.assertNeq(k1, k2, 'k1 != k2');
			this.done();
		}
	}, {
		name: 'aes enc/dec',
		run: function() {
			var pwd = C.aes_key_from_password("qwe");
			var pwd_ok = C.ub64dec("b-9n_tUR0KApHfV6HmLcvg");
			var mk_enc_ok = C.ub64dec("ZRnpzigY09qdbk4XR_MHCw");
			var mk_ok = C.ub64dec("7YfLv-KQ5n79vPsZOmJMKw");
			var mk = C.aes_dec(pwd, mk_enc_ok);
			var mk_enc = C.aes_enc(pwd, mk);

			this.assertEq(pwd, pwd_ok, 'pwd != pwd_ok');
			this.assertEq(mk, mk_ok, 'mk != mk_ok');
			this.assertEq(mk_enc, mk_enc_ok, 'mk_enc != mk_enc_ok');
			this.done();
		}
	}, {
		name: 'aes enc/dec cbc',
		run: function() {
			var pwd = C.aes_key_from_password("qwe");

			var plain_ok = Duktape.Buffer('12341234123412341234123412341234');
			var cipher = C.aes_enc_cbc(pwd, plain_ok);
			var plain = C.aes_dec_cbc(pwd, cipher);

			//print('PLAIN: ' + Duktape.enc('jx', plain_ok));
			//print('CIPHER: ' + Duktape.enc('jx', cipher));
			//print('PLAIN: ' + Duktape.enc('jx', plain));

			this.assertEq(plain, plain_ok, 'plain != plain_ok');
			this.done();

		}
	}, {
		name: 'aes enc/dec ctr',
		run: function() {
			var pwd = C.aes_key_from_password("qwe");
			var nonce = Duktape.Buffer('12341234');

			var plain_ok = Duktape.Buffer('12341234123412341234123412344');
			var cipher = C.aes_ctr(pwd, nonce, 0, plain_ok);
			var plain = C.aes_ctr(pwd, nonce, 0, cipher);

			//print('PLAIN: ' + Duktape.enc('jx', plain_ok));
			//print('CIPHER: ' + Duktape.enc('jx', cipher));
			//print('PLAIN: ' + Duktape.enc('jx', plain));

			this.assertEq(plain, plain_ok, 'plain != plain_ok');
			this.done();

		}
	}, {
		name: 'un hash',
		run: function() {
			var pwd = C.aes_key_from_password("qwe");
			var un = "bob@email.com";
			var un_uc = "BOB@email.com";
			var uh_ok = "Bg3XIXKvoco";
			var uh1 = C.make_username_hash(pwd, un);
			var uh2 = C.make_username_hash(pwd, un_uc);

			this.assertEq(uh1, uh_ok, 'uh1 != uh_ok');
			this.assertEq(uh2, uh_ok, 'uh2 != uh_ok');
			this.done();
		}
	}, {
		name: 'rsa gen',
		run: function() {
			var master_key = C.ub64dec("HVV7qVaNBVR2dmeQKAoLxg");
			var keys1 = C.rsa_generate(master_key);
			var keys2 = C.rsa_generate(master_key);

			this.assertNeq(keys1.pubk, keys2.pubk, 'keys1.pubk == keys1.pubk');
			this.assertNeq(keys1.privk, keys2.privk, 'keys2.privk == keys2.privk');

			//print('RSA GEN: ' + Duktape.enc('jx', [keys1, keys2], null, '  '));

			function trim(b) {
				var trimmed = Duktape.Buffer(16);
				for (var i = 0; i < b.length; i++) {
					trimmed[i] = b[i];
				}
				return trimmed;
			}

			var plain_ok = Duktape.dec('hex', 'ffffffffffffffffffffffffffffffff');
			var cipher = C.rsa_encrypt(keys1.pubk, plain_ok);
			var plain = C.rsa_decrypt(keys1.pubk, keys1.privk, master_key, cipher);
			this.assertEq(trim(plain), plain_ok, 'plain != plain_ok');

			this.done();
		}
	}, {
		name: 'rsa enc/dec',
		run: function() {
			var master_key = C.ub64dec("HVV7qVaNBVR2dmeQKAoLxg");
			var privk_enc = "NsfinhwepaXc1T_3-oChHBjJe1QyrjN3BU3sKpmVKZoU63qYnItlT5jbyWi6PDtJ0rBI19J2EFmPFBns_HMb3SH-WzsuTttaxYqAILFsfrxOkyzsQ4qaAmb2iU8dee69z6GIVfCFFYzoI5661GzzVd-J-0ZZwrWoVEvq9Nwv8N3lP7t8Fb7GSgWUtov2V7IOu4KeIX5K_-ZMpwL8QWJOQUt89iL3ZTJnfQc58FPs-atI8Ofsx4TKDIC2TldJ2YXBs44RK_bQR231Ra42bGakzXGBM_JRuM0wkBMF4xYCI1ej6szxKYzdn-78571dDEQ8qXaVYt847DI_-xtcoonywwsDo5Aw_iDyEHyOL2PxYeIGZosx5Y1_LyjdKRM92l2MDjs0ettTK_sXJcdlnEq0q1QYPi3BjOXh4ntms35fQPZqNxf8V9QHAi5v1R3j-Ht0idzN4zPUWPLQn99XHEm5fOT-KGO4JYtQN1UJuqj-zNRr-s_AgxVamXDdt7JUhs3NZz-b3Kv-oL83___r3zMdscDg0qjkU9QVVcpZZCGkFTF3B2MRnjJmK7_RgxTxswnUqupbguWr2e5_emlmArxNnHDZoKYJtHFt9481eeefStqAvUreelkPDVBkkQ77wehDl1ne6-iJUq-spCroYZi8izQBB5F0FfC7lN4mN17pxtaQKia1DHbI0-UEe0OluPpkC-zMS3NPQx3FLpQLYzWpoIC2B9K4RFI5pZ-6C1iPc5QtO6NBsPzf21zlnQtqWvyuEudi7spzpkgylmGxqjRcwdcZMJUU3Ei_BwHu6ERxuAnrnhyE6nxOwL767gpBwxUPvZht9eEgm5HHFr1tffvTjCwp1ZTPn-J5Y-9LTvQP8Gc";
			var pubk = "B_9TemqO9e4xtP_DyNKmyZJZtRP_nohGTVlF_xYomk1u64jkjpYsQv5sWLt_tl1XQIjZkzg2Q3MyX8e1j9m3429IcvEU6x4cjx-0SkbHKJblQxU_rZIW-BtMXxUt4LGu265XaJCjY_RoexYg5060PuMID59yy1xq6z7NEuitPujiLG1gPYeeFrUvYONYqCJxmmceFuwYdCWBh2zVIJDHIPKJRpIs43K264NLCDK4UtEnAO1HcGox1XqNVNMKiSpeCyK9TV9MRGSvzSQ0Uj1NRUHE8Y7uWk2jgLWcUoiPdCZnfo1HvTvxejs4-DC4E6j_Z3FbS8vJt5Kg1MJm9YXK4v__AAUR";
			var csid = "CAAEtLYp0vnRpXhEH3QmIj-Ul1LJvVmZgC3_cEvrSYSbhgnSnAKZ_9j8cVSlD76dfcyWfhCmjTQBlz0jxR_c6Y6sFKD1-x2jqhwnhb2l53voNcc9bO4H2B4zxSZFoul2yT5MK2flmbbr184iUcC9wIkU28sV2Bs8HmhpJsgh_N_EVnKjI4Mlz5izeYagStLg_qPEYuQkymnF_vV6IRAD8kJLscgrsBTQdzABwMuVJoQqv-m7R_ftDW4wHEr-rkcfDhO_jvbp2Vr5ofWF_6gGP0KaX6_A6L6-o8pQDX_XqodpS1mx1ONviQdqBd0CsjdE4j36YJy3-bdeo1MFz7dlUHCq";
			var sid = "bmXSdJbAQOxUC7wJMdDZS1h6MnRXV0I1RG1vUJwPQ8ZpSRhysTyTsvPVMg";

			function trim(b) {
				var trimmed = Duktape.Buffer(16);
				for (var i = 0; i < b.length; i++) {
					trimmed[i] = b[i];
				}
				return trimmed;
			}

			var plain_ok = Duktape.dec('hex', 'ffffffffffffffffffffffffffffffff');
			var cipher = C.rsa_encrypt(pubk, plain_ok);
			var plain = C.rsa_decrypt(pubk, privk_enc, master_key, cipher);
			this.assertEq(trim(plain), plain_ok, 'plain != plain_ok');

			plain_ok = Duktape.dec('hex', '00ffffffffffffffffffffffffffffff');
			cipher = C.rsa_encrypt(pubk, plain_ok);
			plain = C.rsa_decrypt(pubk, privk_enc, master_key, cipher);
			this.assertEq(trim(plain), plain_ok, 'plain != plain_ok');

			this.done();
		}
	}, {
		name: 'rsa sid',
		run: function() {
			var master_key = C.ub64dec("HVV7qVaNBVR2dmeQKAoLxg");
			var privk_enc = "NsfinhwepaXc1T_3-oChHBjJe1QyrjN3BU3sKpmVKZoU63qYnItlT5jbyWi6PDtJ0rBI19J2EFmPFBns_HMb3SH-WzsuTttaxYqAILFsfrxOkyzsQ4qaAmb2iU8dee69z6GIVfCFFYzoI5661GzzVd-J-0ZZwrWoVEvq9Nwv8N3lP7t8Fb7GSgWUtov2V7IOu4KeIX5K_-ZMpwL8QWJOQUt89iL3ZTJnfQc58FPs-atI8Ofsx4TKDIC2TldJ2YXBs44RK_bQR231Ra42bGakzXGBM_JRuM0wkBMF4xYCI1ej6szxKYzdn-78571dDEQ8qXaVYt847DI_-xtcoonywwsDo5Aw_iDyEHyOL2PxYeIGZosx5Y1_LyjdKRM92l2MDjs0ettTK_sXJcdlnEq0q1QYPi3BjOXh4ntms35fQPZqNxf8V9QHAi5v1R3j-Ht0idzN4zPUWPLQn99XHEm5fOT-KGO4JYtQN1UJuqj-zNRr-s_AgxVamXDdt7JUhs3NZz-b3Kv-oL83___r3zMdscDg0qjkU9QVVcpZZCGkFTF3B2MRnjJmK7_RgxTxswnUqupbguWr2e5_emlmArxNnHDZoKYJtHFt9481eeefStqAvUreelkPDVBkkQ77wehDl1ne6-iJUq-spCroYZi8izQBB5F0FfC7lN4mN17pxtaQKia1DHbI0-UEe0OluPpkC-zMS3NPQx3FLpQLYzWpoIC2B9K4RFI5pZ-6C1iPc5QtO6NBsPzf21zlnQtqWvyuEudi7spzpkgylmGxqjRcwdcZMJUU3Ei_BwHu6ERxuAnrnhyE6nxOwL767gpBwxUPvZht9eEgm5HHFr1tffvTjCwp1ZTPn-J5Y-9LTvQP8Gc";
			var pubk = "B_9TemqO9e4xtP_DyNKmyZJZtRP_nohGTVlF_xYomk1u64jkjpYsQv5sWLt_tl1XQIjZkzg2Q3MyX8e1j9m3429IcvEU6x4cjx-0SkbHKJblQxU_rZIW-BtMXxUt4LGu265XaJCjY_RoexYg5060PuMID59yy1xq6z7NEuitPujiLG1gPYeeFrUvYONYqCJxmmceFuwYdCWBh2zVIJDHIPKJRpIs43K264NLCDK4UtEnAO1HcGox1XqNVNMKiSpeCyK9TV9MRGSvzSQ0Uj1NRUHE8Y7uWk2jgLWcUoiPdCZnfo1HvTvxejs4-DC4E6j_Z3FbS8vJt5Kg1MJm9YXK4v__AAUR";
			var csid = "CAAEtLYp0vnRpXhEH3QmIj-Ul1LJvVmZgC3_cEvrSYSbhgnSnAKZ_9j8cVSlD76dfcyWfhCmjTQBlz0jxR_c6Y6sFKD1-x2jqhwnhb2l53voNcc9bO4H2B4zxSZFoul2yT5MK2flmbbr184iUcC9wIkU28sV2Bs8HmhpJsgh_N_EVnKjI4Mlz5izeYagStLg_qPEYuQkymnF_vV6IRAD8kJLscgrsBTQdzABwMuVJoQqv-m7R_ftDW4wHEr-rkcfDhO_jvbp2Vr5ofWF_6gGP0KaX6_A6L6-o8pQDX_XqodpS1mx1ONviQdqBd0CsjdE4j36YJy3-bdeo1MFz7dlUHCq";
			var sid = "bmXSdJbAQOxUC7wJMdDZS1h6MnRXV0I1RG1vUJwPQ8ZpSRhysTyTsvPVMg";

			var sid_dec = C.rsa_decrypt_sid(privk_enc, master_key, csid);
			this.assertEq(sid, sid_dec, 'sid != sid_dec');
			this.done();
		}
	}]
});

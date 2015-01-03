GW.define('Tool.INFO', 'tool', {
	name: 'info',
	description: 'Shows user account information.',
	usages: [
		'[-s|--secrets] [--binary]'
	],

	getOptsSpecCustom: function() {
		return [{ 
			longName: "secrets",
			shortName: 's',
			help: "Display encryption keys"
		}, { 
			longName: "binary",
			help: "Display encryption keys in binary encoding"
		}].concat(this.loginOpts);
	},

	run: function(defer) {
		var opts = this.opts;

		function printOption(name, label, value) {
			if (_.isUndefined(value) || value === '') {
				return;
			}

			if (opts.batch) {
				print([name, '=', C.shell_quote(String(value))].join(''));
			} else {
				print([label, ': ', value].join(''));
			}
		}

		function showAccountQuota(session) {
			return session.api.callSingle({a: 'uq', strg: 1, xfer: 1, pro: 1}).done(function(res) {
				var typeMap = {
					'0': "Free",
					'1': "Pro I",
					'2': "Pro II",
					'3': "Pro III"
				};

				printOption('ACCOUNT_TYPE', 'Account type', typeMap[String(res.utype)] || 'Unknown');

				if (res.utype > 0) {
					if (res.stype == 'S') {
						var cycleMap = {
							W: 'Weekly',
							M: 'Monthly',
							Y: 'Yearly'
						};

						printOption('SUBSCRIPTION_TYPE', 'Subscription type', 'Subscription');
						printOption('SUBSCRIPTION_CYCLE', 'Subscription cycle', cycleMap[res.scycle] || 'Unknown');
						printOption('SUBSCRIPTION_NEXT', 'Next payment', C.date('%F', res.snext));

					} else if (res.stype == 'O') {
						printOption('SUBSCRIPTION_TYPE', 'Subscription type', 'One-Time');
						printOption('SUBSCRIPTION_UNTIL', 'Subscribed until', C.date('%F', res.suntil));
					}
				}

				var bw = res.mxfer || res.tal || 1024 * 1024 * 1024 * 10;
				var servbw_used = res.csxfer || 0;
				var downbw_used = res.caxfer || 0;
				//var servbw_limit = res.srvratio;

				if (res.tah) {
					downbw_used = _.reduce(res.tah, function(memo, num) { 
						return memo + num; 
					}, 0);
				}

				var perc = Math.min(Math.round((servbw_used + downbw_used) / bw * 100), 100);

				printOption('BANDWIDTH_PERCENT_USED', 'Used bandwidth', perc + '%');
				printOption('BANDWIDTH_SERVER', 'Server bandwidth', servbw_used);
				printOption('BANDWIDTH_DOWNLOAD', 'Download bandwidth', downbw_used);
				printOption('BANDWIDTH', 'Bandwidth', bw);
			});
		}

		function binaryEnc(v) {
			return Duktape.enc('jx', v).replace(/\|/g, '');
		}

		this.getSession().then(function(session) {
			printOption('USERNAME', 'Username', session.username);
			printOption('UH', 'User handle', session.data.uh);
			printOption('EMAIL', 'E-mail', session.data.user.email);
			printOption('NAME', 'Real name', session.data.user.name);
			printOption('CONFIRMED', 'Confirmed', session.data.user.c ? 'YES' : 'NO');

			if (opts.secrets) {
				printOption('PASSWORD', 'Password', session.password);
				printOption('PK', 'Password key', opts.binary ? binaryEnc(session.pk) : C.ub64enc(session.pk));
				printOption('MK', 'Master key', opts.binary ? binaryEnc(session.data.mk) : C.ub64enc(session.data.mk));
				printOption('PUBK', 'RSA public key', session.data.pubk);
				printOption('PRIVK', 'RSA private key (encrypted with MK)', session.data.privk);
			}

			showAccountQuota(session).then(defer.resolve, defer.reject);
		}, function(code, msg) {
			Log.error(msg);
			defer.reject(1);
		}, this);
	}
});

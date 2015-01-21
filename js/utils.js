Utils = {
	getSpace: function(len) {
		var out = [];
		for (var i = 0; i < len; i++) {
			out.push(' ');
		}

		return out.join('');
	},

	humanSize: function(size) {
		function fixed(v) {
			return v.toFixed(1);
		}

		if (size < 1024) {
			return size + ' B';
		} else if (size < 1024 * 1024) {
			return fixed(size / 1024) + ' KiB';
		} else if (size < 1024 * 1024 * 1024) {
			return fixed(size / 1024 / 1024) + ' MiB';
		} else {
			return fixed(size / 1024 / 1024 / 1024) + ' GiB';
		}
	},

	pad: function(s, len) {
		s = String(s);

		return s + Utils.space.substr(0, len - s.length);
	},

	align: function(s, len) {
		s = String(s);

		return Utils.space.substr(0, len - s.length) + s;
	},

	exec: function(cmd, stdin) {
		return Defer.defer(function(defer) {
			C.exec({
				cmd: cmd,
				stdin: stdin,
				oncomplete: function(stdout, stderr, status) {
					if (status == 0) {
						defer.resolve(stdout, stderr);
					} else {
						defer.reject('exec-fail-status', 'Command ' + (_.isArray(cmd) ? cmd.join(' ') : cmd) + ' failed with status ' + status, stdout, stderr, status);
					}
				},
				onerror: function(code, msg) {
					defer.reject(code, msg);
				}
			});
		});
	}
};

Utils.space = Utils.getSpace(200);

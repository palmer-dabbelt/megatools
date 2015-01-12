Utils = {
	getSpace: function(len) {
		var out = [];
		for (var i = 0; i < len; i++) {
			out.push(' ');
		}

		return out.join('');
	},

	breakLine: function(ln, off) {
		var LINE_LEN = 72;
		var words = ln.split(' '), i;
		var out = [];
		var curLen = 0, nextLen;
		var space = Utils.getSpace(LINE_LEN);

		off = off || 0;

		for (i = 0; i < words.length; i++) {
			curLen += 1 + words[i].length;

			if (curLen > LINE_LEN) {
				out.push('\n' + space.substr(0, off));
				curLen = off + 1 + words[i].length;

				out.push(words[i]);
			} else {
				if (i != 0) {
					out.push(' ');
				}

				out.push(words[i]);
			}
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
	}
};

Utils.space = Utils.getSpace(200);

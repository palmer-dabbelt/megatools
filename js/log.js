Log = (function() {
	var DEBUG = 2, WARNING = 1;
	var level = WARNING;
	var isVerbose = false;
	var isColor = C.allow_color;

	var COLORS = {
		DEFAULT       : '\033[39m',
		BLACK         : '\033[30m',
		RED           : '\033[31m',
		GREEN         : '\033[32m',
		YELLOW        : '\033[33m',
		BLUE          : '\033[34m',
		MAGENTA       : '\033[35m',
		CYAN          : '\033[36m',
		LIGHT_GRAY    : '\033[37m',
		DARK_GRAY     : '\033[90m',
		LIGHT_RED     : '\033[91m',
		LIGHT_GREEN   : '\033[92m',
		LIGHT_YELLOW  : '\033[93m',
		LIGHT_BLUE    : '\033[94m',
		LIGHT_MAGENTA : '\033[95m',
		LIGHT_CYAN    : '\033[96m',
		WHITE         : '\033[97m' 
	};

	function setLevel(l) {
		level = l;
	}

	function getLevel() {
		return level;
	}

	function setVerbose(v) {
		isVerbose = !!v;
	}

	function log() {
		var args = Array.prototype.slice.call(arguments);
		var prefix = args.shift();
		var out = [], i, a;

		for (i = 0; i < args.length; i++) {
			a = args[i];

			if (typeof a == 'string') {
				out.push(a);
			} else {
				out.push(Duktape.enc('jx', a));
			}
		}

		out = prefix + out.join(' ');


		out = out.replace(/~(.)/g, function(m, t) {
			switch (t) {
				case 'n': return COLORS.DEFAULT;
				case 'r': return COLORS.RED;
				case 'g': return COLORS.GREEN;
				case 'y': return COLORS.YELLOW;

				// bold start/end
				case 'b': return '\033[1m';
				case 'B': return '\033[21m';
				// dim start/end
				case 'd': return '\033[2m';
				case 'D': return '\033[22m';
				case '~': return '~';
				default:  return m;
			}
		});

		print(out);
	}

	function msg() {
		var args = Array.prototype.slice.call(arguments);
		args.unshift('');
		log.apply(null, args);
	}

	function verbose() {
		if (isVerbose) {
			msg.apply(null, arguments);
		}
	}

	function debug() {
		if (level >= DEBUG) {
			var args = Array.prototype.slice.call(arguments);
			args.unshift('DEBUG: ');
			log.apply(null, args);
		}
	}

	function warning() {
		if (level >= WARNING) {
			var args = Array.prototype.slice.call(arguments);
			args.unshift('WARNING: ');
			log.apply(null, args);
		}
	}

	function error() {
		var args = Array.prototype.slice.call(arguments);
		args.unshift('ERROR: ');
		log.apply(null, args);
	}

	return {
		DEBUG: DEBUG,
		WARNING: WARNING,
		setLevel: setLevel,
		getLevel: getLevel,
		log: log,
		msg: msg,
		debug: debug,
		warning: warning,
		error: error,
		setVerbose: setVerbose,
		verbose: verbose
	};
})();

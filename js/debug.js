Log = (function() {
	var DEBUG = 2, WARNING = 1;
	var level = WARNING;
	var isVerbose = false;

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

		print(prefix + out.join(' '));
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

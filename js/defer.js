Defer = {};

Defer.defer = function(init, scope) {
        var resolveCallbacks = [];
        var rejectCallbacks = [];
	var state = null;
	var args;

	function callCallback(cb) {
		cb.apply(null, args);
	}

	var defer = {
		getState: function() {
			return state || 'pending';
		},

		getArgs: function() {
			return args;
		},

		setArgs: function() {
			args = Array.prototype.slice.call(arguments);
		},

		resolve: function() {
			if (!state) {
				state = 'resolved';
				args = Array.prototype.slice.call(arguments);

				_.each(resolveCallbacks, callCallback);
			}
		},

		reject: function() {
			if (!state) {
				state = 'rejected';
				args = Array.prototype.slice.call(arguments);

				_.each(rejectCallbacks, callCallback);
			}
		},

		then: function(onResolve, onReject, scope) {
			return defer.done(onResolve, scope).fail(onReject, scope);
		},

		done: function(cb, scope) {
			if (cb && state == 'resolved') {
				callCallback(_.bind(cb, scope || defer));
			} else if (cb && !state) {
				resolveCallbacks.push(_.bind(cb, scope || defer));
			}

			return defer;
		},

		fail: function(cb, scope) {
			if (cb && state == 'rejected') {
				callCallback(_.bind(cb, scope || defer));
			} else if (cb && !state) {
				rejectCallbacks.push(_.bind(cb, scope || defer));
			}

			return defer;
		},

		complete: function(cb, scope) {
			return defer.done(cb, scope).fail(cb, scope);
		}
	};

	init && init.call(scope || defer, defer);

	return defer;
};

Defer.resolved = function() {
	var args = Array.prototype.slice.call(arguments);
	return Defer.defer(function(defer) {
		defer.resolve.apply(null, args);
	});
};

Defer.rejected = function() {
	var args = Array.prototype.slice.call(arguments);
	return Defer.defer(function(defer) {
		defer.reject.apply(null, args);
	});
};

Defer.timeout = function(timeout) {
	var args = Array.prototype.slice.call(arguments);
	args.shift();

	return Defer.defer(function(defer) {
		var timer = C.timeout(function() {
			defer.resolve.apply(null, args);
		}, timeout);

		defer.abort = function() {
			defer.reject('abort');

			if (timer) {
				timer.abort();
				timer = null;
			}
		};
	});
};

Defer.when = function(defers) {
	var totalDefer = Defer.defer();
	var resolved = [];
	var rejected = [];

	function checkDone() {
		var done = !_.find(defers, function(d) {
			return d.getState() == 'pending';
		}) || defers.length == 0;

		if (done) {
			totalDefer.resolve(resolved, rejected);
		}
	}

	_.each(defers, function(d) {
		d.then(function() {
			resolved.push(d);
			checkDone();
		}, function() {
			rejected.push(d);
			checkDone();
		});
	});

	checkDone();

	return totalDefer;
};

Defer.chain = function(runners) {
	return Defer.defer(function(defer) {
		function runNext() {
			var runner = runners.shift();
			if (runner) {
				runner.apply(null, arguments).then(function() {
					runNext.apply(null, arguments);
				}, defer.reject);
			} else {
				defer.resolve.apply(null, arguments);
			}
		}

		runNext();
	});
};

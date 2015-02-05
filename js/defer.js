Defer = {
	PENDING: 0,
	RESOLVED: 1,
	REJECTED: 2
};

Defer.defer = function(init, scope) {
        var subscribers = [];
	var state = 0;
	var args;

	function dispatch(child, onResolve, onReject, scope) {
		var callback = arguments[state], chain;

		if (_.isFunction(callback)) {
			try {
				chain = callback.apply(scope || defer, args);
			} catch (ex) {
				child.reject('exception', ex.message, ex);
				return;
			}

			if (chain && chain.isDeferred) {
				chain.then(child.resolve, child.reject);
				return;
			}
		}

		child[state == Defer.RESOLVED ? 'resolve' : 'reject'].apply(null, args);
	}

	var defer = {
		isDeferred: true,

		getState: function() {
			return state;
		},

		resolve: function() {
			if (!state) {
				state = Defer.RESOLVED;
				args = Array.prototype.slice.call(arguments);

				var i;
				for (i = 0; i < subscribers.length; i++) {
					dispatch.apply(null, subscribers[i]);
				}
			}
		},

		reject: function() {
			if (!state) {
				state = Defer.REJECTED;
				args = Array.prototype.slice.call(arguments);

				var i;
				for (i = 0; i < subscribers.length; i++) {
					dispatch.apply(null, subscribers[i]);
				}
			}
		},

		then: function(onResolve, onReject, scope) {
			if (state === Defer.RESOLVED && !onResolve || state === Defer.REJECTED && !onReject) {
				return defer;
			}

			var child = Defer.defer();

			if (state) {
				dispatch(child, onResolve, onReject, scope);
			} else {
				subscribers.push([child, onResolve, onReject, scope]);
			}

			return child;
		},

		done: function(cb, scope) {
			return defer.then(cb, undefined, scope);
		},

		fail: function(cb, scope) {
			return defer.then(undefined, cb, scope);
		},

		complete: function(cb, scope) {
			return defer.then(cb, cb, scope);
		}
	};

	try {
		init && init.call(scope || defer, defer);
	} catch (ex) {
		defer.reject('exception', ex.message, ex);
	}

	return defer;
};

Defer.resolved = function() {
	var defer = Defer.defer();
	defer.resolve.apply(null, arguments);
	return defer;
};

Defer.rejected = function() {
	var defer = Defer.defer();
	defer.reject.apply(null, arguments);
	return defer;
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
			return !d.getState();
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

Defer.chain = function(runners, scope) {
	var runner, first = runners.shift();

	if (!first) {
		return Defer.resolved();
	}

	var defer = first();
	while ((runner = runners.shift())) {
		defer = defer.then(runner);
	}

	return defer;
};

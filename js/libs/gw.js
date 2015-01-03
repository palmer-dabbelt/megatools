/**
 * GW - Goo Web
 *
 * Lightweight jQuery/Underscore.js based widget/web app development framework
 *
 * Copyright, 2014, Ondřej Jirman <megous@megous.com>
 */

// Polyfills:

// {{{ Object.create

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create
if (typeof Object.create != 'function') {
	Object.create = (function() {
		var Object = function() {};

		return function (prototype) {
			if (arguments.length > 1) {
				throw Error('Second argument not supported');
			}

			if (typeof prototype != 'object') {
				throw TypeError('Argument must be an object');
			}

			Object.prototype = prototype;
			var result = new Object();
			Object.prototype = null;

			return result;
		};
	})();
}

// }}}

// Core functions/global:

// {{{ G/GW

G = this;
GW = {};

// }}}
// {{{ GW.Class

(function() {
	"use strict";

	GW.Class = function() {};
	GW.Class.__className__ = 'GW.Class';
	GW.Class.__classXType__ = 'class';
	GW.Class.__classParent__ = null;
	GW.Class.__classXTypeIndex__ = {};
	GW.Class.__classNameIndex__ = {};
	GW.Class.parent = null;

	GW.Class.__getClassMethod__ = function(cls, name) {
		if (!_.isFunction(cls) || !cls.__className__) {
			throw TypeError('Can\'t get class method of a non-GW class');
		}

		if (cls.prototype.hasOwnProperty(name)) {
			if (!_.isFunction(cls.prototype[name])) {
				throw TypeError('Property ' + cls.__className__ + '.' + name + ' is not a function');
			}

			return cls.prototype[name];
		}

		return cls.prototype[name] = GW.Function(function() {
			if (_.isFunction(cls.parent[name])) {
				return cls.parent[name].apply(this, arguments);
			}
		}, cls.__className__ + '.' + name);
	};

	GW.Class.__getInstanceMethod__ = function(inst, name) {
		if (!(inst instanceof GW.Class)) {
			throw TypeError('Can\'t get instance method of a non-GW class');
		}

		var cls = inst.constructor;

		// instance already has this property, just return it
		if (inst.hasOwnProperty(name)) {
			if (!_.isFunction(inst[name])) {
				throw TypeError('Property ' + cls.__className__ + '.' + name + ' is not a function');
			}

			return inst[name];
		}

		return inst[name] = GW.Function(function() {
			if (cls.prototype[name]) {
				return cls.prototype[name].apply(this, arguments);
			}
		}, cls.__className__ + '.' + name);
	};

	_.extend(GW.Class.prototype, {
		__classConstructor__: function() {
		},

		isXType: function(xtype) {
			var cls = GW.Class.__classXTypeIndex__[xtype];
			if (!cls) {
				return false;
			}

			return this instanceof cls;
		},

		__method__: function(name) {
			return GW.Class.__getInstanceMethod__(this, name);
		}
	});

        // derive new class
	GW.Class.define = function(name, parent, props) {
		var xtype = (name.substr(0, 3) == 'GW.' ? name.substr(3) : name).toLowerCase();
		var cls = function Instance() {
			this.__classConstructor__.apply(this, arguments);
		};

		cls.__className__ = name;
		cls.__classXType__ = xtype;
		cls.__classParent__ = parent;
		cls.prototype = Object.create(parent.prototype);
                cls.prototype.constructor = cls;
		cls.prototype.xtype = xtype;
		cls.parent = parent.prototype; // for super calls
		cls.__method__ = function(name) {
			return GW.Class.__getClassMethod__(cls, name);
		};

		// register xtype and class name
		if (!props.singleton) {
			GW.Class.__classXTypeIndex__[xtype] = cls;
			GW.Class.__classNameIndex__[name] = cls;
		}

		_.each(props, function(v, k) {
			if (_.isFunction(v) && k != 'constructor') {
				cls.prototype[k] = GW.Function(v, name + '.' + k);
			} else if (k == 'constructor') {
				if (_.isFunction(v)) {
					cls.prototype.__classConstructor__ = v;
				}
			} else {
				cls.prototype[k] = v;
			}
		});

		return cls;
	};
})();

// }}}
// {{{ GW.Function

GW.Function = function(fn, name) {
        // wrapped function

	var wrap = function() {
		return wrap.__functionWrapper__.apply(this, arguments);
	};

	// universal wrapper

	//XXX: not exception safe, needs try/finally around any function calls, and restore $fn, $return_value
	function wrapper() {
		var retval, i, l, savedFn = this.$fn, savedRetval = this.$return_value;

		this.$fn = wrap.__function__;

		for (i = 0, l = wrap.__functionBefore__.length; i < l; i++) {
			retval = wrap.__functionBefore__[i].apply(this, arguments);

			if (typeof retval != 'undefined') {
				this.$fn = savedFn;
				return retval;
			}
		}

		retval = wrap.__function__.apply(this, arguments);

		this.$fn = null;

		if (wrap.__functionAfter__.length > 0) {
			this.$return_value = retval;

			for (i = 0, l = wrap.__functionAfter__.length; i < l; i++) {
				retval = wrap.__functionAfter__[i].apply(this, arguments);

				if (typeof retval != 'undefined') {
					this.$return_value = retval;
				}
			}

			retval = this.$return_value;
		}

		this.$fn = savedFn;
		this.$return_value = savedRetval;

		return retval;
	}

	// optimized wrappers

	var optimizedWrappers = {
		B0A0: function() {
			return wrap.__function__.apply(this, arguments);
		},

		B1A0: function() {
			var savedFn = this.$fn;

			this.$fn = wrap.__function__;

			var rv1 = wrap.__functionBefore__[0].apply(this, arguments);
			if (typeof rv1 != 'undefined') {
				this.$fn = savedFn;
				return rv1;
			}

			var rv2 = wrap.__function__.apply(this, arguments);

			this.$fn = savedFn;

			return rv2;
		},

		B0A1: function() {
			var savedFn = this.$fn, savedRetval = this.$return_value;

			this.$return_value = wrap.__function__.apply(this, arguments);
			this.$fn = null;

			var rv1 = wrap.__functionAfter__[0].apply(this, arguments);
			if (typeof rv1 != 'undefined') {
				retval = rv1;
			} else {
				retval = this.$return_value;
			}

			this.$return_value = savedRetval; // delete here is too slow
			this.$fn = savedFn;

			return retval;
		}
	};

	function getSignature() {
		return ['B', wrap.__functionBefore__.length, 'A', wrap.__functionAfter__.length].join('');
	}

	function updateWrapper() {
		wrap.__functionWrapper__ = optimizedWrappers[getSignature()] || wrapper;
	}

	wrap.__function__ = fn;
	wrap.__functionName__ = name;
	wrap.__functionAfter__ = [];
	wrap.__functionBefore__ = [];
	updateWrapper();

	wrap.after = function(fn) {
		wrap.__functionAfter__.push(fn);
		updateWrapper();
		return wrap;
	};

	wrap.afterDeferred = function(fn) {
		function deferredChainer() {
			var me = this;
			var args = _.toArray(arguments);

			return $.Deferred(function(defer) {
				fn.apply(me, [me.$return_value, defer].concat(args));
			}).promise();
		}

		wrap.__functionAfter__.push(deferredChainer);
		updateWrapper();
		return wrap;
	};

	wrap.before = function(fn) {
		wrap.__functionBefore__.push(fn);
		updateWrapper();
		return wrap;
	};

	wrap.replace = function(fn) {
		wrap.__function__ = fn;
		return wrap;
	};

	return wrap;
};

// }}}
// {{{ GW.define

GW.define = function() {
	var args = _.toArray(arguments);
	if (args.length < 2 || args.length > 3 || !_.isString(args[0])) {
		throw new Error("Invalid call to GW.define, usage GW.define(name [,parent], props)");
	}

	var name = args.shift();
	var ns = G;
	var parts = name.split('.');
	var lastName = parts.shift();

	while (parts.length > 0) {
		if (!ns[lastName]) {
			ns[lastName] = {};
		} else if (!_.isObject(ns[lastName])) {
			throw new Error("Can't define class " + name + " because part of the namespace is not an object");
		}

		ns = ns[lastName];
		lastName = parts.shift();
	}

	// create class
	var props = args[args.length - 1];
	var parent = args.length == 2 ? args[0] : GW.Class;

	function resolveParent(p) {
		var cls = null;
		if (_.isString(p)) {
			cls = GW.Class.__classNameIndex__[p] || GW.Class.__classXTypeIndex__[p];
			if (!cls) {
				throw new Error("Can't define " + name + " because parent class " + p + " is undefined");
			}

			return cls;
		} else if (_.isObject(p)) {
			if (p.__className__) {
				return p;
			}

			throw new Error("Can't define " + name + " because parent classes was not defined by GW.define");
		} else {
			throw new Error("Can't define " + name + " because parent class is invalid");
		}
	}

	if (props.singleton) {
		return ns[lastName] = new (GW.Class.define(name, resolveParent(parent), props))();
	}

	return ns[lastName] = GW.Class.define(name, resolveParent(parent), props);
};

// }}}
// {{{ GW.create

GW.create = function(o, defaultXType) {
	if (o instanceof GW.Class) {
		return o;
	}

	var xtype = o.xtype || defaultXType || 'component';
	var cls = GW.Class.__classXTypeIndex__[xtype] || null;

	if (cls) {
		return new cls(o);
	} else {
		throw new Error('Trying to create undefined xtype ' + xtype);
	}
};

// }}}

// Core component/container classes:

// {{{ GW.Object

GW.define('GW.Object', {

	constructor: function(config) {
		this.applyConfig(config);
		this.initExtensible();
		this.initObservable();
		this.initObject();
	},

	applyConfig: function(config) {
		_.each(config || {}, function(v, k) {
			if (k == 'constructor') {
				throw new Error('Trying to overwrite constructor of ' + this.constructor.__className__);
			}

			if (_.isFunction(v)) {
				this[k] = GW.Function(v, this.constructor.__className__ + '.' + k, this.constructor.__classParent__.prototype);
			} else {
				this[k] = v;
			}
		}, this);
	},

	initObject: function() {
	},

	destroy: function() {
		this.destroyObservable();
	},

	// objects are extensible

	initExtension: function(ext) {
		if (_.isString(ext)) {
			ext = GW.create({}, ext);
		} else if (_.isObject(ext)) {
			if (!(ext instanceof GW.Extension)) {
				ext = GW.create(ext, 'extension');
			}
		} else {
			throw new Error('Unknown extension ' + ext);
		}

		return ext;
	},

	initExtensible: function() {
		this.extensions = this.extensions || [];

		// instantiate extensions of this extensible object
		this.extensions = _.map(this.extensions, function(ext) {
			return this.initExtension(ext);
		}, this);

		_(this.extensions).invoke('init', this);
	},

	addExtension: function(ext) {
		return this.extensions.push(this.initExtension(ext));
	},

	hook: function() {
		var args = _.toArray(arguments), name = args.shift();

		return _.map(this.extensions || [], function(ext) {
			if (ext.hook && _.isFunction(ext.hook[name])) {
				return ext.hook[name].apply(this, [ext].concat(args));
			}
		}, this);
	},

        // objects are observable

	initObservable: function() {
		if (this.listeners) {
			_.each(this.listeners, function(v, k, l) {
				if (k != 'scope') {
					this.on(k, v, l.scope);
				}
			}, this);
		}
	},

	on: function(name, fn, scope, opts) {
		var me = this, l;

		opts = opts || {};
		name = name.toLowerCase();

		if (opts.deep) {
			this._busListeners = this._busListeners || {};
			
			l = GW.EventBus.addListener(name, this, opts.query, fn, scope);

			// wrap remove so that it clean up _busListeners in addition to the EventBus.listeners
			l.remove = _(l.remove).chain().bind(l).wrap(function(fn) {
				if (this.id) {
					delete me._busListeners[this.id];
				}

				fn();
			}).value();

			this._busListeners[l.id] = l;
			return l;
		}

		l = {
			id: _.uniqueId('ol'),
			name: name,
			fn: fn,
			scope: scope,
			remove: function() {
				if (this.id) {
					delete me._events[this.name][this.id];
					delete this.id;
				}
			},
			fire: function(args) {
				if (this.id) {
					this.fn.apply(this.scope || this, args);
				}
			}
		};

		this._events = this._events || {};
		this._events[name] = this._events[name] || {};
		this._events[name][l.id] = l;

		return l;
	},

	mon: function(obj, name, fn, scope, opts) {
		var me = this;
		var l = obj.on(name, fn, scope, opts);

		this._monListeners = this._monListeners || {};
		this._monListeners[l.id] = l;

		// wrap remove so that it clean up _monListeners in addition to the obj's _events
		l.remove = _(l.remove).chain().bind(l).wrap(function(fn) {
			if (this.id) {
				delete me._monListeners[this.id];
			}

			fn();
		}).value();

		return l;
	},

	fire: function() {
		var args = _.toArray(arguments), name = args.shift().toLowerCase();

		args.unshift(this);
		
		// fire on the event bus
		GW.EventBus.fire(this, name, args);

		// fire locally
		var listeners = this._events && this._events[name];
		if (listeners) {
			_.invoke(listeners, 'fire', args);
		}
	},

	destroyObservable: function() {
		if (this._events) {
			_.each(this._events, function(eg) {
				_.invoke(eg, 'remove');
			});
		}

		if (this._busListeners) {
			_.invoke(this._busListeners, 'remove');
		}

		if (this._monListeners) {
			_.invoke(this._monListeners, 'remove');
		}

		delete this._events;
		delete this._busListeners;
		delete this._monListeners;
	}
});

// }}}
// {{{ GW.Extension

GW.define('GW.Extension', 'object', {
	init: function(instance) {
	}
});

// }}}
// {{{ GW.EventBus

GW.EventBus = {
	listeners: {},

	addListener: function(name, ref, query, fn, scope) {
		var l = {
			id: _.uniqueId('bl'),
			fn: fn,
			scope: scope,
			query: query,
			ref: ref,
			name: name,
			remove: function() {
				if (this.id) {
					delete GW.EventBus.listeners[this.id];
					delete this.id;
				}
			},
			fire: function(args) {
				if (this.id) {
					this.fn.apply(this.scope || this, args);
				}
			}
		};

		GW.EventBus.listeners[l.id] = l;

		return l;
	},

	// every event fired by any observable goes through here
	fire: function(obj, name, args) {
		_.each(GW.EventBus.listeners, function(l, id) {
			// event name matches
			if (l.name == name) {
				var o = obj;
				var h = [];
				while (l.ref && o && o != l.ref) {
					h.push(o);
					o = o.owner;
				}

				// ref is obj or it's owner or ref is not specified
				if (!l.ref || o == l.ref) {
					l.fire(args);
				}
			}
		});
	}
};

// }}}

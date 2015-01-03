GW.define('Tool.DF', 'tool', {
	name: 'df',
	description: 'Shows available, used and free space in the cloud in machine or human readable formats.',
	usages: [
		'[--free|--total|--used] [--kb|--mb|--gb|--human]'
	],

	getOptsSpecCustom: function() {
		return [{ 
			longName: "human",
			shortName: 'h',
			help: "Display file sizes in a human readable format"
		}, { 
			longName: "kb",
			shortName: 'k',
			help: "Show in KiB units"                 
		}, { 
			longName: "mb",
			shortName: 'm',
			help: "Show in MiB units"                 
		}, { 
			longName: "gb",
			shortName: 'g',
			help: "Show in GiB units"                 
		}, { 
			longName: "total",
			help: "Show only total available space (free + used)"     
		}, { 
			longName: "used", 
			help: "Show only used space"                
		}, { 
			longName: "free", 
			help: "Show only available free space"      
		}].concat(this.loginOpts);
	},

	examples: [{
		title: 'Show overall human readable space usage information',
		commands: [
			'$ megadf',
			'Total: 50.0 GiB',
			'Used: 6.4 GiB',
			'Free: 43.6 GiB'
		]
	}, {
		title: 'Check free space from a script',
		commands: [
			'$ test `megadf -b --free -g` -lt 1 && \\',
			'  echo "You have less than 1 GiB of available free space"'
		]
	}],

	run: function(defer) {
		var opts = this.opts;
		var usedSelectorOpts = _([opts.total, opts.used, opts.free]).compact();
		if (usedSelectorOpts.length > 1) {
			Log.error('You can\'t combine multiple --total, --used or --free options');
			defer.reject(10);
			return;
		}

		var usedFormatOpts = _([opts.kb, opts.mb, opts.gb, opts.human]).compact();
		if (usedFormatOpts.length > 1) {
			Log.error('You can\'t combine multiple --kb, --mb, --gb or --human options');
			defer.reject(10);
			return;
		}

		if (usedFormatOpts.length == 0 && !opts.batch) {
			opts.human = true;
		}

		function fixed(v) {
			return v.toFixed(2);
		}

		function printSize(size, label, batchLabel) {
			if (opts.kb) {
				size = fixed(size / 1024);
			} else if (opts.mb) {
				size = fixed(size / 1024 / 1024);
			} else if (opts.gb) {
				size = fixed(size / 1024 / 1024 / 1024);
			} else if (opts.human) {
				if (size < 1024 * 2) {
					size = size + ' B';
				} else if (size < 1024 * 1024 * 2) {
					size = fixed(size / 1024) + ' KiB';
				} else if (size < 1024 * 1024 * 1024 * 2) {
					size = fixed(size / 1024 / 1024) + ' MiB';
				} else {
					size = fixed(size / 1024 / 1024 / 1024) + ' GiB';
				}
			}

			if (label) {
				if (opts.batch && batchLabel) {
					print(batchLabel + '=' + size);
				} else {
					print(label + ': ' + size);
				}
			} else {
				print(size);
			}
		}

		this.getSession().then(function(session) {
			session.api.callSingle({a:'uq', strg:1, xfer:1, pro:1}).then(function(res) {
				if (opts.total) {
					printSize(res.mstrg);
				} else if (opts.used) {
					printSize(res.cstrg);
				} else if (opts.free) {
					printSize(res.mstrg - res.cstrg);
				} else {
					printSize(res.mstrg, 'Total', 'TOTAL');
					printSize(res.cstrg, 'Used', 'USED');
					printSize(res.mstrg - res.cstrg, 'Free', 'FREE');
				}

				defer.resolve();
			}, defer.reject, this);
		}, function(code, msg) {
			Log.error(msg);
			defer.reject(1);
		}, this);
	}
});

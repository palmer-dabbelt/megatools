GW.define('Tool.DF', 'tool', {
	order: 300,
	name: 'df',
	description: 'Show available, used and free space',
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
			'$ test $(megatools df -b --free -g) -lt 1 && \\',
			'  echo "You have less than 1 GiB of available free space"'
		]
	}],

	run: function() {
		var opts = this.opts;

		var usedSelectorOpts = _([opts.total, opts.used, opts.free]).compact();
		if (usedSelectorOpts.length > 1) {
			return Defer.rejected('args', 'You can\'t combine multiple --total, --used or --free options');
		}

		var usedFormatOpts = _([opts.kb, opts.mb, opts.gb, opts.human]).compact();
		if (usedFormatOpts.length > 1) {
			return Defer.rejected('args', 'You can\'t combine multiple --kb, --mb, --gb or --human options');
		}

		if (!opts.batch) {
			opts.human = true;
		}

		function fixed(v) {
			return Math.round(v);
		}

		function printSize(size, label, batchLabel) {
			if (opts.kb) {
				size = fixed(size / 1024);
			} else if (opts.mb) {
				size = fixed(size / 1024 / 1024);
			} else if (opts.gb) {
				size = fixed(size / 1024 / 1024 / 1024);
			} else if (opts.human) {
				size = Utils.humanSize(size);
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

		return this.getSession({
			loadFilesystem: false
		}).then(function(session) {
			return session.api.getUsage();
		}).then(function(res) {
			if (opts.total) {
				printSize(res.total);
			} else if (opts.used) {
				printSize(res.used);
			} else if (opts.free) {
				printSize(res.free);
			} else {
				printSize(res.total, 'Total', 'TOTAL');
				printSize(res.used, 'Used', 'USED');
				printSize(res.free, 'Free', 'FREE');
			}
		});
	}
});

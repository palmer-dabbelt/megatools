GW.define('Tool.LS', 'tool', {
	order: 500,
	name: 'ls',
	description: 'Lists files stored on Mega.co.nz.',
	usages: [
		'[-h] [-l] [-R] [-n] [<remotepaths>...]'
	],

	getOptsSpecCustom: function() {
		return [{ 
			longName: "names",
			shortName: 'n',
			help: "List names of files only (will be disabled if you specify multiple paths)" 
		}, { 
			longName: "recursive",
			shortName: 'R', 
			help: "List files in subdirectories"            
		}, { 
			longName: "long",   
			shortName: 'l',   
			help: "Use a long listing format"               
		}, {
			longName: "human",
			shortName: 'h',
			help: "Use a long listing format"               
		}].concat(this.loginOpts);
	},

	run: function(defer) {
		var data = {};

		Defer.chain([
			function() {
				return this.getSession();
			},

			function(session) {
				data.session = session;

				return session.getFilesystem().load();
			},

			function() {
				var fs = data.session.getFilesystem();

				Log.msg(fs.getPaths().join('\n'));

				return Defer.resolved();
			}
		], this).then(function() {
			defer.resolve();
		}, function(code, msg) {
			Log.error(msg);
			defer.reject(1);
		}, this);
	}
});

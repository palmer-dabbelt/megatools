GW.define('Tool.DOC', 'tool', {
	order: 5000,
	name: 'doc',
	description: 'Generate external documentation',
	usages: [
		'-o <path> -f [html|txt|man]'
	],

	getOptsSpecCustom: function() {
		return [{ 
			longName: "output",
			shortName: 'o', 
			argHelp: 'PATH',
			arg: 'string',
			help: "Output directory"
		}, { 
			longName: "format",   
			shortName: 'f',   
			argHelp: 'FORMAT',
			arg: 'string',
			help: "Output format. One of: html, txt, man."
		}];
	},

	run: function(defer) {
		var opts = this.opts;

		if (!opts.output) {
			Log.error("Output directory was not specified");
			defer.reject(10);
			return;
		}

		if (!opts.format) {
			Log.error("Format was not specified");
			defer.reject(10);
			return;
		}

		if (!C.dir_exists(opts.output)) {
			Log.error("Output directory does not exist");
			defer.reject(1);
			return;
		}

		var renderer;
		switch (opts.format) {
			case 'txt':
				renderer = new Document.Renderer.Text();
				break;
			case 'html':
				renderer = new Document.Renderer.Html();
				break;
			case 'man':
				renderer = new Document.Renderer.Man();
				break;
			default:
				Log.error("Format `" + opts.format + "` is not known");
				defer.reject(10);
				return;
		}

		var files = [{
			name: 'megatools',
			doc: app.getHelp()
		}];

		_(app.getTools()).each(function(t) {
			var tool = new t.cls();

			files.push({
				name: 'megatools-' + tool.name,
				doc: tool.getHelp()
			});
		});

		_.each(files, function(f) {
			var path = C.path_simplify(opts.output + '/' + f.name + '.' + opts.format);

			if (!C.file_write(path, Duktape.Buffer(renderer.render(f.doc)))) {
				Log.error("Can't write file '" + path + "'");
				defer.reject(1);
				return;
			}
		});

		defer.resolve();
	}
});


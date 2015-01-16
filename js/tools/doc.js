GW.define('Tool.DOC', 'tool', {
	order: 5000,
	name: 'doc',
	allowArgs: true,
	description: 'Generate external documentation',
	usages: [
		'-o <path> -f [html|txt|man] <docs>...'
	],

	getOptsSpecCustom: function() {
		return [{ 
			longName: "output",
			shortName: 'o', 
			argHelp: '<path>',
			arg: 'string',
			help: "Output directory"
		}, { 
			longName: "format",   
			shortName: 'f',   
			argHelp: '<format>',
			arg: 'string',
			help: "Output format. One of: html, txt, or man."
		}];
	},

	run: function() {
		var opts = this.opts;

		if (!opts.output) {
			return Defer.rejected('args', "Output directory was not specified");
		}

		if (!opts.format) {
			return Defer.rejected('args', "Format was not specified");
		}

		if (!C.dir_exists(opts.output)) {
			return Defer.rejected('args', "Output directory does not exist");
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
				return Defer.rejected('args', "Format `" + opts.format + "` is not known");
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

		files = _(files).filter(function(f) {
			return this.args.length == 0 || this.args.indexOf(f.name) >= 0;
		}, this);

		_.each(files, function(f) {
			var path = C.path_clean(opts.output + '/' + f.name + renderer.suffix(f.doc));

			if (!C.file_write(path, Duktape.Buffer(renderer.render(f.doc)))) {
				return Defer.rejected('err', "Can't write file '" + path + "'");
			}
		});

		return Defer.resolved();
	}
});


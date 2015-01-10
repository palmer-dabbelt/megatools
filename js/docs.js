GW.define('Document', 'object', {

	initObject: function() {
		this.entries = [];
	},

	usage: function(usages) {
		this.entries.push({
			type: 'usages',
			usages: usages
		});
	},

	options: function(options) {
		this.entries.push({
			type: 'options',
			options: options
		});
	},

	heading: function(text) {
		this.entries.push({
			type: 'heading',
			text: text
		});
	},

	paragraphs: function(paragraphs) {
		_(paragraphs).each(function(p) {
			this.paragraph([p]);
		}, this);
	},

	paragraph: function(lines) {
		this.entries.push({
			type: 'paragraph',
			lines: lines
		});
	},

	commands: function(lines) {
		this.entries.push({
			type: 'commands',
			lines: lines
		});
	},

	table: function(rows) {
		this.entries.push({
			type: 'table',
			rows: rows
		});
	},

	definitions: function(items) {
		this.entries.push({
			type: 'definitions',
			items: items
		});
	},

	examples: function(examples) {
		if (examples && examples.length > 0) {
			this.entries.push({
				type: 'examples',
				examples: examples
			});
		}
	},

	footer: function() {
		this.paragraph([
			'Megatools ' + C.version + ' - command line tools for Mega.co.nz',
			'Written by Ondřej Jirman <megous@megous.com>, ' + C.date('%Y'),
			'Go to http://megatools.megous.com for more information',
			'Report bugs at https://github.com/megous/megatools/issues'
		]);

		this.entries[this.entries.length - 1].group = 'footer';
	},

	toScreen: function() {
		var renderer = new Document.Renderer.Text();
		var text = renderer.render(this);

		print(text);
	}
});

GW.define('Document.Renderer', 'object', {
	render: function(doc) {
		this.out = [];
		this.doc = doc;

                this.renderHeader();
		this.renderEntries();
                this.renderFooter();

		return this.out.join('');
	},

	getEntriesByType: function(type) {
		return _(this.doc.entries).filter(function(entry) {
			return entry.type == type;
		});
	},

	renderHeader: function() {
	},

	renderFooter: function() {
	},

	renderEntries: function() {
		_.each(this.doc.entries, this.renderEntry, this);
	},

	renderEntry: function(entry) {
		switch (entry.type) {
			case 'usages':          this.renderUsages(entry);       break;
			case 'options':         this.renderOptions(entry);      break;
			case 'heading':         this.renderHeading(entry);      break;
			case 'paragraph':       this.renderParagraph(entry);    break;
			case 'commands':        this.renderCommands(entry);     break;
			case 'table':           this.renderTable(entry);        break;
			case 'definitions':     this.renderDefinitions(entry);  break;
			case 'examples':        this.renderExamples(entry);     break;
			default: break;
		}
	},

	renderUsages: function(entry) {
	},

	renderOptions: function(entry) {
	},

	renderHeading: function(entry) {
	},

	renderParagraph: function(entry) {
	},

	renderCommands: function(entry) {
	},

	renderTable: function(entry) {
	},

	renderDefinitions: function(entry) {
	},

	renderExamples: function(entry) {
	}
});

GW.define('Document.Renderer.Text', 'document.renderer', {
	initObject: function() {
		this.space = Utils.getSpace(200);
	},

	renderLine: function(ln, off) {
		this.out.push(Utils.breakLine(ln, off), '\n');
	},

	renderEmptyLine: function() {
		this.out.push('\n');
	},

	renderUsages: function(entry) {
		this.renderLine('Usage:');
		_(entry.usages || []).each(function(usage) {
			this.renderLine('  megatools ' + usage.name + ' ' + usage.usage, 4);
		}, this);
		this.renderEmptyLine();
	},

	renderOptions: function(entry) {
		this.renderLine('Application Options:');

		function optLeftSide(opt) {
			return _.compact([_.compact([opt.shortName ? '-' + opt.shortName : null, opt.longName ? '--' + opt.longName : null]).join(', '), (opt.argHelp ? opt.argHelp : '')]).join(' ');
		}

		var leftColumnWidth = 2 + 1 + _(entry.options).reduce(function(res, opt) {
			return Math.max(res, optLeftSide(opt).length);
		}, 0);

		var space = Utils.getSpace(leftColumnWidth);

		_(entry.options).each(function(opt) {
			var left = optLeftSide(opt);
			var lns = _.isArray(opt.help) ? opt.help : opt.help.split('\n');

			this.renderLine('  ' + left + space.substr(left.length + 2) + ' ' + lns.shift(), leftColumnWidth + 1);
			_.each(lns, function(ln) {
				this.renderLine(space + ' ' + ln, leftColumnWidth + 1);
			}, this);
		}, this);

		this.renderEmptyLine();
	},

	renderHeading: function(entry) {
		var underline = '====================================================';
		this.renderEmptyLine();
		this.renderLine(entry.text);
		this.renderLine(underline.substr(0, entry.text.length));
		this.renderEmptyLine();
	},

	renderParagraph: function(entry) {
		_(entry.lines).each(function(line) {
			this.renderLine(line);
		}, this);

		this.renderEmptyLine();
	},

	renderCommands: function(entry) {
		_(entry.lines).each(function(line) {
			this.renderLine('  ' + line, 4);
		}, this);

		this.renderEmptyLine();
	},

	renderTable: function(entry) {
		var widths = [], i, rows = entry.rows || [];

		if (rows.length == 0) {
			return;
		}

		for (i = 0; i < rows[0].length; i++) {
			widths[i] = _.reduce(rows, function(memo, row) {
				return row[i].length > memo ? row[i].length : memo;
			}, 0);
		}

		_(rows).each(function(row) {
			var cols = [], c, off = 0, pad;

			cols.push('  ');
			off += 2;

			for (c = 0; c < widths.length; c++) {
				pad = '';
				if (c != widths.length - 1) {
					pad = this.space.substr(0, widths[c] - row[c].length + 2);
					off += widths[c] + 2;
				}

				cols.push(row[c], pad);
			}

			this.renderLine(cols.join(''), off);
		}, this);

		this.renderEmptyLine();
	},

	renderDefinitions: function(entry) {
		_(entry.items).each(function(item) {
			this.renderLine(item[0]);
			this.renderEmptyLine();
			this.renderLine('  ' + item[1], 2);
			this.renderEmptyLine();
		}, this);
	},

	renderExamples: function(entry) {
		_(entry.examples || []).each(function(ex, idx) {
			this.renderLine('Example ' + (idx + 1) + ': ' + ex.title);
			this.renderEmptyLine();

			if (ex.commands) {
				_(ex.commands).each(function(c) {
					this.renderLine('  ' + c, 4);
				}, this);

				this.renderEmptyLine();
			} else if (ex.steps) {
				_(ex.steps).each(function(s) {
					if (s.description) {
						this.renderLine('  ' + s.description, 2);
					}

					_(s.commands).each(function(c) {
						this.renderLine('    ' + c, 6);
					}, this);

					this.renderEmptyLine();
				}, this);
			}
		}, this);
	}
});                          
                             
GW.define('Document.Renderer.Man', 'document.renderer', {
	manCategory: 1,

	ln: function(ln) {
		this.out.push(ln, '\n');
	},

	f: function(str) {
		return str
			.replace(/\*([^\*]+)\*/g, '\\fB$1\\fP')
			.replace(/`([^`]+)`/g, '\\fB$1\\fP');
	},

	e: function(str) {
		return str.replace(/-/g, '\\-').replace(/\./g, '\\&.');
	},

	ef: function(str) {
		return this.f(this.e(str));
	},

	p: function(text) {
		this.ln('.sp');
		this.ln(this.ef(text));
	},

	dl: function(items) {
		_(items).each(function(item) {
			this.ln('.PP');
			this.ln('\\fI' + this.e(item[0]) + '\\fP');
			this.ln('.RS');
			this.ln(this.ef(item[1]));
			this.ln('.RE');
		}, this);
	},

	heading: function(text) {
		this.ln('.SH "' + this.e(text.toUpperCase()) + '"');
	},

	subHeading: function(text) {
		this.ln('.SS "' + this.e(text) + '"');
	},

	renderHeader: function() {
		this.ln('\'\\" t');
		this.ln('.TH "' + this.doc.name.toUpperCase() + '" "' + this.manCategory + '" "' + C.date('%m/%d/%Y') + '" "megatools ' + C.version + '" "Megatools Manual"');
		this.ln('.ie \\n(.g .ds Aq \\(aq');
		this.ln('.el       .ds Aq \'');
		this.ln('.nh');
		this.ln('.ad l');
		this.ln('.SH "NAME"');
		this.ln(this.doc.name + ' \\- ' + this.doc.description);
	},

	renderEntries: function() {
		var usages = this.getEntriesByType('usages');
		if (usages[0]) {
			this.renderUsages(usages[0]);
		}

		this.heading('DESCRIPTION');

		_(this.doc.entries).chain().filter(function(entry) {
			return entry.type != 'usages' && entry.type != 'options' && entry.type != 'examples' && entry.group != 'footer';
		}).each(function(entry) {
			this.renderEntry(entry);
		}, this);

		var opts = this.getEntriesByType('options');
		if (opts[0]) {
			this.renderOptions(opts[0]);
		}

		var examples = this.getEntriesByType('examples');
		if (examples[0]) {
			this.renderExamples(examples[0]);
		}

		if (this.doc.name == 'megatools') {
			this.heading('SEE ALSO');
			var manpages = _(app.getTools()).map(function(t) {
				return '*megatools-' + t.name + '*(' + this.manCategory + ')';
			}, this).join(', ');
			this.p(manpages);

			this.heading('AUTHOR');
			this.p('Written by Ondřej Jirman <megous@megous.com>, ' + C.date('%Y'));

			this.heading('REPORTING BUGS');
			this.p('Report bugs at https://github.com/megous/megatools/issues');

			this.heading('MORE INFORMATION');
			this.dl([
				['Official home page', 'http://megatools.megous.com'],
				['Source code', 'https://github.com/megous/megatools']
			]);
		} else {
			this.heading('MEGATOOLS');
			this.p('Part of the *megatools*(1) suite.');
		}
	},

	renderUsages: function(entry) {
		this.heading('SYNOPSIS');
		this.ln('.sp');
		this.ln('.nf');
		_(entry.usages || []).each(function(usage) {
			this.ln('\\fI' + this.e('megatools ' + usage.name) + '\\fP ' + this.e(usage.usage));
		}, this);
		this.ln('.fi');
	},

	renderOptions: function(entry) {
		this.heading('OPTIONS');

		function optLeftSide(opt) {
			return _.compact([_.compact([opt.shortName ? '-' + opt.shortName : null, opt.longName ? '--' + opt.longName : null]).join(', '), (opt.argHelp ? opt.argHelp : '')]).join(' ');
		}

		_(entry.options).each(function(opt) {
			var left = optLeftSide(opt);
			var lns = _.isArray(opt.help) ? opt.help : opt.help.split('\n');

			this.ln('.PP');
			this.ln(this.e(left));
			this.ln('.RS');
			_.each(lns, function(ln) {
				this.ln(this.ef(ln));
			}, this);
			this.ln('.RE');
		}, this);
	},

	renderHeading: function(entry) {
		this.heading(entry.text);
	},

	renderParagraph: function(entry) {
		_(entry.lines).each(function(line) {
			this.ln('.sp');
			this.ln(this.ef(line));
		}, this);
	},

	renderCommands: function(entry) {
		this.ln('.sp');
		this.ln('.nf');
		this.ln('.RS');
		_(entry.lines).each(function(line) {
			this.ln(this.e(line));
		}, this);
		this.ln('.RE');
		this.ln('.fi');
	},

	renderTable: function(entry) {
		this.dl(entry.rows);
	},

	renderDefinitions: function(entry) {
		this.dl(entry.items);
	},

	renderExamples: function(entry) {
		this.heading('EXAMPLES');
		this.ln('.sp');
		_(entry.examples || []).each(function(ex, idx) {
			this.subHeading(ex.title);

			if (ex.commands) {
				this.ln('.sp');
				this.ln('.nf');
				_(ex.commands).each(function(c) {
					this.ln(this.e(c));
				}, this);
				this.ln('.fi');
			} else if (ex.steps) {
				_(ex.steps).each(function(s) {
					if (s.description) {
						this.p(s.description);
					}

					this.ln('.sp');
					this.ln('.nf');
					this.ln('.RS');
					_(s.commands).each(function(c) {
						this.ln(this.e(c));
					}, this);
					this.ln('.RE');
					this.ln('.fi');
					this.ln('.sp');
				}, this);
			}
		}, this);
	}
});

GW.define('Document.Renderer.Html', 'document.renderer', {
	ln: function(ln) {
		this.out.push(ln, '\n');
	},

	link: function(str) {
		var map = {};
		var pages = _(app.getTools()).each(function(t) {
			map['megatools-' + t.name] = 'megatools-' + t.name + '.html';
			map[t.name] = 'megatools-' + t.name + '.html';
		});
		map['megatools'] = 'megatools.html';

		var re = new RegExp('\\b(?:(https?://([a-zA-Z0-9-]+)(\.([a-zA-Z0-9-]+))*(/[a-z0-9A-Z-/]+)?)|' + _(map).keys().join('|') + ')\\b', 'g');

		return str.replace(re, function(m) {
			if (m.match(/^https?:/)) {
				return '<a href="' + m + '">' + m + '</a>';
			}
			return '<a href="' + map[m] + '">' + m + '</a>';
		});
	},

	f: function(str) {
		return str
			.replace(/\*([^\*]+)\*/g, '<strong>$1</strong>')
			.replace(/`([^`]+)`/g, '<em>$1</em>');
	},

	e: function(value) {
		return !value ? '' : String(value).replace(/&/g, "&amp;").replace(/>/g, "&gt;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
	},

	ef: function(str) {
		return this.link(this.f(this.e(str)));
	},

	p: function(text) {
		this.ln('<p>' + this.ef(text) + '</p>');
	},

	dl: function(items) {
		this.ln('<dl>');
		_(items).each(function(item) {
			this.ln('<dt>' + this.link(this.e(item[0])) + '</dt>');
			this.ln('<dd>' + this.ef(item[1]) + '</dd>');
		}, this);
		this.ln('</dl>');
	},

	heading: function(text) {
		this.ln('<h2>' + this.e(text) + '</h2>');
	},

	subHeading: function(text) {
		this.ln('<h3>' + this.e(text) + '</h3>');
	},

	renderHeader: function() {
		this.ln('<!DOCTYPE html>');
		this.ln('<html>');
		this.ln('<head>');
		this.ln('<meta charset="utf-8">');
		this.ln('<meta name="description" content="' + this.e('Manual for megatools ' + C.version) + '">');
		this.ln('<style>');
		this.ln(this.e([
			'body { margin: 0; padding: 40px; color: #333; }',
			'a, h1, h2, h3, dt { color: black; }',
			'pre { margin-left: 40px; }',
			'dl { }',
			'dt { font-style: italic; }',
			'dd { margin: 10px 0 10px 40px; }'
		].join('\n')));
		this.ln('</style>');
		this.ln('<title>' + this.e(this.doc.name) + '</title>');
		this.ln('</head>');
		this.ln('<body>');
		this.ln('<h1>' + this.e(this.doc.name) + '</h1>');
		this.p(this.doc.description);
	},

	renderFooter: function() {
		this.ln('</body>');
		this.ln('</html>');
	},

	renderEntries: function() {
		var usages = this.getEntriesByType('usages');
		if (usages[0]) {
			this.renderUsages(usages[0]);
		}

		this.heading('Description');

		_(this.doc.entries).chain().filter(function(entry) {
			return entry.type != 'usages' && entry.type != 'options' && entry.type != 'examples' && entry.group != 'footer';
		}).each(function(entry) {
			this.renderEntry(entry);
		}, this);

		var opts = this.getEntriesByType('options');
		if (opts[0]) {
			this.renderOptions(opts[0]);
		}

		var examples = this.getEntriesByType('examples');
		if (examples[0]) {
			this.renderExamples(examples[0]);
		}

		if (this.doc.name == 'megatools') {
			this.heading('See Also');
			var manpages = _(app.getTools()).map(function(t) {
				return t.name;
			}, this).join(', ');
			this.p(manpages);

			this.heading('Author');
			this.p('Written by Ondřej Jirman <megous@megous.com>, ' + C.date('%Y'));

			this.heading('Rerporting Bugs');
			this.p('Report bugs at https://github.com/megous/megatools/issues');

			this.heading('More Information');
			this.dl([
				['Official home page', 'http://megatools.megous.com'],
				['Source code', 'https://github.com/megous/megatools']
			]);
		} else {
			this.heading('Megatools');
			this.p('Part of the *megatools* suite.');
		}
	},

	renderUsages: function(entry) {
		this.heading('Usage');
		this.ln('<pre class="usage">');
		_(entry.usages || []).each(function(usage) {
			this.ln(this.link('<em>' + this.e('megatools ' + usage.name) + '</em> ' + this.e(usage.usage)));
		}, this);
		this.ln('</pre>');
	},

	renderOptions: function(entry) {
		this.heading('Options');

		function optLeftSide(opt) {
			return _.compact([_.compact([opt.shortName ? '-' + opt.shortName : null, opt.longName ? '--' + opt.longName : null]).join(', '), (opt.argHelp ? opt.argHelp : '')]).join(' ');
		}

		this.ln('<dl class="options">');
		_(entry.options).each(function(opt) {
			var left = optLeftSide(opt);
			var lns = _.isArray(opt.help) ? opt.help : opt.help.split('\n');

			this.ln('<dt>' + this.e(left) + '</dt>');
			_.each(lns, function(ln) {
				this.ln('<dd>' + this.ef(ln) + '</dd>');
			}, this);
		}, this);
		this.ln('</dl>');
	},

	renderHeading: function(entry) {
		this.heading(entry.text);
	},

	renderParagraph: function(entry) {
		_(entry.lines).each(function(line) {
			this.p(line);
		}, this);
	},

	renderCommands: function(entry) {
		this.ln('<pre class="code">');
		_(entry.lines).each(function(line) {
			this.ln(this.link(this.e(line)));
		}, this);
		this.ln('</pre>');
	},

	renderTable: function(entry) {
		this.dl(entry.rows);
	},

	renderDefinitions: function(entry) {
		this.dl(entry.items);
	},

	renderExamples: function(entry) {
		this.heading('Examples');

		_(entry.examples || []).each(function(ex, idx) {
			this.subHeading(ex.title);

			if (ex.commands) {
				this.ln('<pre>');
				_(ex.commands).each(function(c) {
					this.ln(this.link(this.e(c)));
				}, this);
				this.ln('</pre>');
			} else if (ex.steps) {
				_(ex.steps).each(function(s) {
					if (s.description) {
						this.p(s.description);
					}

					this.ln('<pre>');
					_(s.commands).each(function(c) {
						this.ln(this.link(this.e(c)));
					}, this);
					this.ln('</pre>');
				}, this);
			}
		}, this);
	}
});

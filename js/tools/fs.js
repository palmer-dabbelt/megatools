GW.define('Tool.FS', 'tool', {
	order: 2000,
	name: 'fs',
	description: 'Mount remote filesystem using FUSE',
	usages: [
               '[-f] <mountpoint>'
	],

	allowArgs: true,
	getOptsSpecCustom: function() {
		return [{
		    argHelp: '<mountpoint>',
		    help: 'Local directory where the filesystem should be mounted.'
		}, {
		    longName: 'foreground',
		    shortName: 'f',
		    help: 'Run filesystem in foreground mode.'
		}].concat(this.loginOpts);
	},

	//Some useful options may be: kernel_cache, auto_cache, allow_other, allow_root, nonempty.

	examples: [{
		title: 'Mount filesystem',
		commands: [
			'$ mkdir mount_dir',
			'$ megatools fs --username your@email.com --password "Your Password" mount_dir'
		]
	}],

	mount: function(fs, mountpoint) {
		return Defer.defer(function(defer) {
			function stat(node) {
				return {
					name: node.name,
					type: isdir(node) ? 'dir' : 'file',
					size: node.size,
					mtime: node.mtime,
					ino: node.handle == '*TOP*' ? 1 : C.handle_to_inode(node.handle)
				};
			}

			function lookup(ino) {
				var handle = ino == 1 ? '*TOP*' : C.inode_to_handle(ino);
				var node = fs.getNodeByHandle(handle);
				if (node) {
					return node;
				}
			}

			function readdir(node) {
				var children = fs.getChildren(node);

				return _.map(children || [], stat);
			}

			function isdir(node) {
				return node.type != NodeType.FILE;
			}

			function findChildByName(node, name) {
				var children = fs.getChildren(node), i, l;

				for (i = 0, l = children.length; i < l; i++) {
					if (children[i].name == name) {
						return children[i];
					}
				}
			}

			C.fuse({
				getattr: function(req, ino) {
					var node = lookup(ino);
					if (node) {
						this.reply_attr(req, stat(node));
					} else {
						this.reply_err(req, this.ENOENT);
					}
				},

				lookup: function(req, parent, name) {
					var node = lookup(parent);
					if (!node) {
						this.reply_err(req, this.ENOENT);
					} else if (isdir(node)) {
						var child = findChildByName(node, name);
						if (child) {
							this.reply_entry(req, stat(child));
						} else {
							this.reply_err(req, this.ENOENT);
						}
					} else {
						this.reply_err(req, this.ENOTDIR);
					}
				},

				readdir: function(req, ino) {
					var node = lookup(ino);
					if (!node) {
						this.reply_err(req, this.ENOENT);
					} else if (isdir(node)) {
						this.reply_dir(req, readdir(node));
					} else {
						this.reply_err(req, this.ENOTDIR);
					}
				},

				open: function(req, ino, flags) {
					var node = lookup(ino);
					if (!node) {
						this.reply_err(req, this.ENOENT);
					} else if (isdir(node)) {
						this.reply_err(req, this.EISDIR);
					} else if (flags == 'r') {
						this.reply_open(req);
					} else {
						this.reply_err(req, this.EACCES);
					}
				},

				read: function(req, ino, size, off) {
					var node = lookup(ino);
					if (!node) {
						this.reply_err(req, this.ENOENT);
					} else if (isdir(node)) {
						this.reply_err(req, this.EISDIR);
					} else {
						var buf = Duktape.Buffer('');
						C.slicebuf(buf, off, size);
						this.reply_buf(req, buf);
					}
				}
			}, [mountpoint]);
		}, this);
	},

	run: function(defer) {
		if (this.args.length != 1) {
			return Defer.rejected('args', 'You must provide exactly one argument - a mount point for the filesystem.');
		}

		return this.getSession().done(function(session) {
			return this.mount(session.getFilesystem(), this.args[0]);
		}, this);
	}
});

GW.define('Tool.CP', 'tool', {
	order: 730,
	name: 'cp',
	description: 'Copy files and folders within a remote filesystem',
	allowArgs: true,
	usages: [
		'[-r] [-f] [-T|--no-target-folder] <source> <destination>',
		'[-r] [-f] <sources>... <folder>',
		'[-r] [-f] -t <folder> <sources>...'
	],

	examples: [{
		title: 'Copy files and folders to a selected folder',
		commands: [
			'$ megatools cp -r /Root/file /Root/folder /Root/dest-folder'
		]
	}, {
		title: 'Copy file under a new name in the same folder',
		commands: [
			'$ megatools cp -T /Root/file /Root/file-copy'
		]
	}, {
		title: 'Copy file to a different folder (commands are equivalent)',
		commands: [
			'$ megatools cp /Root/file /Root/target-dir',
			'$ megatools cp -t /Root/target-dir /Root/file'
		]
	}],

	getOptsSpecCustom: function() {
		return [{
			longName: 'recursive',
			shortName: 'r',
			help: 'Copy folders recursively.'
		}, {
			longName: 'force',
			shortName: 'f',
			help: 'Overwrite files that already exist under a destination path. Folders are not overwritten.'
		}, {
			longName: 'target-folder',
			shortName: 't',
			arg: 'string',
			argHelp: 'PATH',
			help: 'Specify a target folder to copy `<sources>` to. Folder must exist or the copy fails.'
		}, {
			longName: 'no-target-folder',
			shortName: 'T',
			help: 'Specifies that `<destination>` is not supposed to be a folder. If this option is not used `megatools mv /Root/a /Root/b` will copy `a` to folder `b` if `b` is an existing folder.'
		}, {
			argHelp: '<source>, <sources>',
			help: 'One or more remote filesystem paths to copy.'
		}, {
			argHelp: '<destination>',
			help: 'Path to copy file to.'
		}, {
			argHelp: '<folder>',
			help: 'Folder to copy `<sources>` to.'
		}].concat(this.loginOpts);
	},

	run: function(defer) {
		var opts = this.opts;
		var args = this.args;
		var nargs = args.length;
		var t = opts['target-folder'];
		var T = opts['no-target-folder'];
		var f = opts.force;
		var r = opts.recursive;
		var srcPaths, destPath;

		if (t && T) {
			Log.error('Options -t <folder> and -T are not compatible');
			defer.reject(10);
			return;
		} else if (t) {
			if (nargs < 1) {
				Log.error('When -t <folder> is used you must pass <sources>...');
				defer.reject(10);
				return;
			}

			srcPaths = args;
			destPath = t;
		} else if (T) {
			if (nargs != 2) {
				Log.error('When -T option requires exactly two arguments: <source> <destination>');
				defer.reject(10);
				return;
			}

			srcPaths = [args[0]];
			destPath = args[1];
		} else {
			if (nargs < 1) {
				Log.error('You need to specify files and folders to move');
				defer.reject(10);
				return;
			}

			if (nargs < 2) {
				Log.error('You need to specify destination path');
				defer.reject(10);
				return;
			}

			srcPaths = args.slice(0, -1);
			destPath = args[args.length - 1];
		}
 
		Defer.chain([
			function() {
				return this.getSession();
			},

			function(session) {
				// Process command line options and filesystem information to determine
				// node of a folder we're copying our srcNodes into (destNode).
				//
				// If one of srcNodes is going to be renamed, put the new name into 
				// destNameMap[srcNode.handle].

				var fs = session.getFilesystem();
				var destNode = fs.getNodeByPath(destPath);
				var destFolderPath, destFolderNode, destName, rename;

				if (t) {
					// forced treatment of destPath as a folder where srcNodes will be put
					destFolderNode = destNode;
					destFolderPath = destPath;
				} else if (T) {
					destFolderPath = C.path_up(destPath);

					// forced treatment of destPath as destFolderPath + destName
					if (!destFolderPath || destPath == destFolderPath) {
						return Defer.rejected('err', 'Invalid destination ' + destPath);
					}

					destFolderNode = fs.getNodeByPath(destFolderPath);
					destName = C.path_name(destPath);
					rename = true;
				} else {
					// smart treatment of destPath based on number of cmd line arguments 
					// and actual destNode type and existence
					if (args.length == 2) {
						if (destNode && destNode.type != NodeType.FILE) {
							// destination is a folder
							destFolderNode = destNode;
							destFolderPath = destPath;
						} else {
							// destination doesn't exist or is a file
							destFolderPath = C.path_up(destPath);

							// forced treatment of destPath as destFolderPath + destName
							if (!destFolderPath || destPath == destFolderPath) {
								return Defer.rejected('err', 'Invalid destination ' + destPath);
							}

							destFolderNode = fs.getNodeByPath(destFolderPath);
							destName = C.path_name(destPath);
							rename = true;
						}
						// exactly two arguments, second one doesn't need to be a folder
					} else {
						// more than one source requires the destNode to be existing folder
						destFolderNode = destNode;
						destFolderPath = destPath;
					}
				}

				if (!destFolderNode) {
					return Defer.rejected('err', 'Destination folder not found ' + destFolderPath);
				}

				if (destFolderNode.type == NodeType.FILE) {
					return Defer.rejected('err', 'Destination path is not a folder ' + destFolderPath);
				}

				if (destFolderNode.type == NodeType.TOP || destFolderNode.type == NodeType.NETWORK) {
					return Defer.rejected('err', 'Destination folder is not writable ' + destFolderNode.path);
				}

				if (rename && !destName) {
					return Defer.rejected('err', 'Destination file name can\'t be determined for ' + destPath);
				}

				// now we have destFolderNode that will receive the srcNodes
				// get source nodes that will be copied

				var delNodes = [];
				var srcNodes = _(fs.getNodesForPaths(srcPaths)).filter(function(n) {
					if (n.type != NodeType.FOLDER && n.type != NodeType.FILE) {
						Log.warning('Special folder ' + n.path + ' can\'t be copied, skipping');
						return false;
					}

					if (!r && n.type == NodeType.FOLDER) {
						Log.warning('Folder ' + n.path + ' can\'t be copied in non-recursive mode, skipping');
						return false;
					}

					// check if a child node under destFolderNode exists with the same name
					var dn = fs.getChildByName(destFolderNode, destName || n.name);
					if (dn) {
						if (dn.handle == n.handle) {
							Log.warning('Self-copy detected at ' + n.path + ', skipping');
							return false;
						}

						if (dn.type != NodeType.FILE) {
							Log.warning('Folder already exists at ' + dn.path + ', skipping');
							return false;
						} else if (!f) {
							Log.warning('File already exists at ' + dn.path + ', skipping');
							return false;
						}

						delNodes.push(dn);
					}

					return true;
				});

				// bail out early if there are no srcNodes left
				if (srcNodes.length == 0) {
					return Defer.rejected('no_do', 'Nothing to do!');
				}

				session.api.startBatch();

				_(delNodes).each(function(n) {
					session.api.callSingle({
						a: "d",
						n: n.handle
					});
				});

				session.api.callSingle({
					a: "p",
					t: destFolderNode.handle,
					n: _(srcNodes).chain().map(function(n) {
						var nodes = [{
							h: n.handle,
							t: n.type,
							a: rename ? MegaAPI.makeNodeAttrs(n.key, {n: destName}) : n.a,
							k: C.ub64enc(C.aes_enc(session.data.mk, n.key_full))
						}];

						if (r) {
							nodes = nodes.concat(_(fs.getChildrenDeep(n)).map(function(n) {
								return {
									h: n.handle,
									t: n.type,
									a: n.a,
									k: C.ub64enc(C.aes_enc(session.data.mk, n.key_full)),
									p: n.parent
								};
							}));
						}

						return nodes;
					}).flatten().value()
				}).then(function() {
					_(srcNodes).each(function(n) {
						Log.verbose('Copied ' + n.path + ' to ' + destFolderNode.path + '/' + (destName || n.name));
					});
				}, function(code, msg) {
					Log.error('Failed to copy files and folders');
				});

				return session.api.sendBatch();
			}
		], this).then(function() {
			defer.resolve();
		}, function(code, msg) {
			Log.error(msg);
			defer.reject(1);
		}, this);
	}
});

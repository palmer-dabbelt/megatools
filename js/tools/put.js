GW.define('Tool.PUT', 'tool', {
	order: 1000,
	name: 'put',
	description: 'Upload files to the remote filesystem',
	allowArgs: true,
	usages: [
		'[-r] [-f] [-t <targetfolder>] <localpaths>...',
		'[-r] [-f] -o <targetpath> <localpath>',
		'[-f] -o <targetpath> -s <size> -'
	],

	examples: [{
		title: 'Upload file:',
		commands: [
			'$ megatools put file'
		]
	}, {
		title: 'Upload file using a different name:',
		commands: [
			'$ megatools put -o /Root/renamed-file file'
		]
	}, {
		title: 'Upload folder:',
		commands: [
			'$ megatools put -r mydir'
		]
	}, {
		title: 'Upload files and folders to a particular remote folder:',
		commands: [
			'$ megatools put -r -t /Root/backup photos/ list.txt'
		]
	}, {
		title: 'Upload contents of a file directly from a HTTP server (streaming upload):',
		commands: [
			'$ URL=\'http://server.net/resource/path\'',
			'$ SIZE=$(curl -sI "$URL" | grep -i ^content-length | cut -d \' \' -f 2)',
			'$ curl -s "$URL" | megatools put - -s "$SIZE" -o /Root/http-file'
		]
	}],

	getOptsSpecCustom: function() {
		return [{
			longName: 'recursive',
			shortName: 'r',
			help: 'Upload folders recursively.'
		}, {
			longName: 'force',
			shortName: 'f',
			help: 'Overwrite existing files. Folders are never overwritten.'
		}, {
			longName: 'target-folder',
			shortName: 't',
			arg: 'string',
			argHelp: '<targetfolder>',
			help: 'Target folder to upload `<localpaths>` to. Default is `/Root`.'
		}, {
			longName: 'output',
			shortName: 'o',
			arg: 'string',
			argHelp: '<targetpath>',
			help: 'Target path where the `<localpath>` will be upload. You must specify exactly one file or folder to upload. File or folder will be accessible at `<targetpath>`.'
		}, {
			longName: 'size',
			shortName: 's',
			arg: 'string',
			argHelp: '<size>',
			help: 'Size of a streaming upload, when `-` is used.'
		}, {
			argHelp: '<localpaths>, <localpath>',
			help: [
				'One or more local files to upload. You may specify `-` to perform streaming upload from the standard input. Option `-s` is mandatory for streaming uploads.'
			]
		}, {
			argHelp: '<targetfolder>',
			help: [
				'Remote folder where the `<localpaths>` will be stored.'
			]
		}, {
			argHelp: '<targetpath>',
			help: [
				'Remote path for the `<localpath>`. You store local files under different name on the remote filesystem using `<targetpath>` option. Remote folder containing the `<targetpath>` must exist.'
			]
		}].concat(this.loginOpts);
	},

	run: function() {
		var opts = this.opts;
		var args = this.args;
		var r = opts.recursive;
		var f = opts.force;
		var t = opts['target-folder'];
		var o = opts.output;
		var s = opts.size;
		var targetFolderPath, transferPaths = [];

		if (o) {
			if (args.length != 1) {
				return Defer.rejected('args', "You must specify exactly one <localpath> to be uploaded or `-` when using `-o` option.");
			}

			targetFolderPath = C.path_up(o);

			if (!targetFolderPath || targetFolderPath == o) {
				return Defer.rejected('args', "Can't determine remote folder to upload to.");
			}

			transferPaths.push({
				isFolder: false,
				localPath: args[0], 
				remoteName: C.path_name(o)
			});

			if (!transferPaths[0].remoteName) {
				return Defer.rejected('args', "Can't determine remote name for " + o);
			}

			if (transferPaths[0].localPath != '-') {
				var path = transferPaths[0].localPath;
				var isFile = C.file_exists(path);
				var isDir = C.dir_exists(path);

				if (isDir && !r) {
					return Defer.rejected('args', "Can't upload folder in non-recursive mode: " + path);
				}

				if (!isFile && !isDir) {
					return Defer.rejected('args', "Not a file or folder: " + path);
				}

				transferPaths[0].isFolder = isDir;
			} else {
				if (!_.isString(s)) {
					return Defer.rejected('args', "You must provide stream size using `-s <size>` option.");
				}

				if (!s.match(/^([1-9][0-9]*|0)$/)) {
					return Defer.rejected('args', "Stream size is not a valid number of bytes: " + s);
				}

				transferPaths[0].size = s;
			}
		} else {
			targetFolderPath = t || '/Root';

			if (args.length == 0) {
				return Defer.rejected('args', "You must specify <localpaths> to upload.");
			}

			var error;
			_(args).find(function(path) {
				var isFile = C.file_exists(path);
				var isDir = C.dir_exists(path);

				if (isDir && !r) {
					error = Defer.rejected('args', "Can't upload folder in non-recursive mode: " + path);
					return true;
				}

				if (!isFile && !isDir) {
					error = Defer.rejected('args', "Not a file or folder: " + path);
					return true;
				}

				var remoteName = C.path_name(path);
				if (!remoteName) {
					error = Defer.rejected('args', "Can't determine remote name for: " + path);
					return true;
				}

				transferPaths.push({
					isFolder: isDir,
					size: C.file_size(path),
					localPath: path,
                                        remoteName: remoteName
				});
			});

			if (error) {
				return error;
			}
		}

		if (s && (args.length != 1 || args[0] != '-')) {
			return Defer.rejected('args', "You can use `-s` only when doing a streaming upload.");
		}

		return this.getSession().then(function(session) {
			var fs = session.getFilesystem();
			var targetFolderNode = fs.getNodeByPath(targetFolderPath);
			var delNodes = [];

			if (!targetFolderNode) {
				return Defer.rejected('not_found', 'Remote folder not found ' + targetFolderPath);
			}

			if (targetFolderNode.type == NodeType.FILE) {
				return Defer.rejected('not_found', 'Target folder is a file ' + targetFolderPath);
			}

			if (transferPaths.length == 1 && transferPaths.localPath == '-') {
				// stream
				return Defer.rejected('no_impl', 'Streaming is not implemented yet');
			}

			transferPaths = _(transferPaths).filter(function(transfer) {
				var n = fs.getChildByName(targetFolderNode, transfer.remoteName);
				if (n) {
					if (n.type == NodeType.FILE) {
						if (!f) {
							Log.warning('File or folder already exists ' + n.path + ', skipping');
							return false;
						}

						delNodes.push(n);
					} else {
						Log.warning('Folder already exists ' + n.path + ', skipping');
						return false;
					}
				}

				return true;
			});

			if (transferPaths.length == 0) {
				return Defer.rejected('nop', 'Nothing to do!');
			}

			// - add files from uploaded folders recursively into transferPaths
			// - pre-create remote folders as necessary
			// - populate transferPaths with individual targetFolderHandle and targetFolderPath

			function populateTransferPaths(transfers, dryRun) {
				var batch = session.api.createBatch();
				var moreTransfers = [];

				_(transfers).chain().filter(function(transfer) {
					return transfer.isFolder;
				}).each(function(transfer) {
					var children = C.dir_read(transfer.localPath);
					if (!children) {
						Log.warning("Can't read folder " + transfer.localPath + ", skipping");
						return;
					}

					var transfersForFolder = [];
					_(children).each(function(e) {
						var newTransfer = {
							isFolder: e.type == 'dir',
							localPath: transfer.localPath + (C.os == 'windows' ? '\\' : '/') + e.name,
							size: e.size,
							remoteName: e.name
						};

						moreTransfers.push(newTransfer);
						transfersForFolder.push(newTransfer);
					});

					if (!dryRun && transfer.targetFolderHandle) {
						/* for sync
						var existing = fs.getNodeByPath(transfer.targetFolderPath + '/' + transfer.remoteName);
						if (existing) {
							_(transfersForFolder).each(function(t) {
								t.targetFolderHandle = existing.handle;
								t.targetFolderPath = existing.path;
							});
							return;
						}

						*/
						var folderPath = transfer.targetFolderPath + '/' + transfer.remoteName;

						Log.verbose('Create folder ' + folderPath);

						batch.createFolder(transfer.remoteName, transfer.targetFolderHandle, session.data.mk).then(function(node) {
							_(transfersForFolder).each(function(t) {
								t.targetFolderHandle = node.handle;
								t.targetFolderPath = folderPath;
							});
						}, function(code, msg) {
							Log.error('Failed to create remote folder ' + folderPath + ': ' + msg);
						});
					}
				});

				if (moreTransfers.length > 0) {
					transferPaths = transferPaths.concat(moreTransfers);

					if (dryRun) {
						return populateTransferPaths(moreTransfers, dryRun);
					} else {
						return Defer.defer(function(defer) {
							batch.send().done(function() {
								populateTransferPaths(moreTransfers, dryRun).done(defer.resolve);
							});
						});
					}
				} else {
					return Defer.resolved();
				}
			}

			_(transferPaths).each(function(transfer) {
				transfer.targetFolderHandle = targetFolderNode.handle;
				transfer.targetFolderPath = targetFolderNode.path;
			});

			return populateTransferPaths(transferPaths, false).done(function() {
				//print(Duktape.enc('jx', [targetFolderNode, transferPaths], null, '    '));
				// perform uploads (show overall progress in -v mode)

				_(transferPaths).chain().filter(function(transfer) {
					return !transfer.isFolder;
				}).each(function(transfer) {
					Log.verbose('Upload file ' + transfer.targetFolderPath + '/' + transfer.remoteName);
				});
			});
		});
	}
});

GW.define('TestSuite.Session', 'TestSuite', {
	name: 'session',

	tests: [{
		name: 'path',
		run: function() {
			var paths = {
				'/': '/',
				'.': '.',
				'./': '.',
				'./../.': '..',
				'../qwe/': '../qwe',
				'../qwe/.qwe': '../qwe/.qwe',
				'../qwe/...': '../qwe/...',
				'../..///': '../..',
				'../../qwe/..': '../..',
				'../..///asdf/asdfasdfasdf/asdfsdgsdfgfg/../sdfgsdfgsdfg/../../qwe////./././.': '../../asdf/qwe'
			};

			_(paths).each(function(sp_good, p) {
				var sp = C.path_clean(p);

				print(p + ' -> ' + sp);
				this.assertEq(sp, sp_good, 'sp != sp_good');
			}, this);

			this.done();
		}
	}, {
		name: 'pathup',
		run: function() {
			var paths = {
				'/': '/',
				'.': '..',
				'./': '..',
				'./../.': '../..',
				'../qwe/': '..',
				'../qwe/.qwe': '../qwe',
				'../qwe/...': '../qwe',
				'../..///': '../../..',
				'../../qwe/..': '../../..',
				'../..///asdf/asdfasdfasdf/asdfsdgsdfgfg/../sdfgsdfgsdfg/../../qwe////./././.': '../../asdf'
			};

			_(paths).each(function(sp_good, p) {
				var sp = C.path_up(p);

				print(p + ' -> ' + sp);
				this.assertEq(sp, sp_good, 'sp != sp_good');
			}, this);

			this.done();
		}
	}, {
		name: 'pathlast',
		run: function() {
			var paths = {
				'/': null,
				'.': null,
				'./': null,
				'./../.': null,
				'../qwe/': 'qwe',
				'../qwe/.qwe': '.qwe',
				'../qwe/...': '...',
				'../..///': null,
				'../../qwe/..': null,
				'../..///asdf/asdfasdfasdf/asdfsdgsdfgfg/../sdfgsdfgsdfg/../../qwe////./././.': 'qwe'
			};

			_(paths).each(function(sp_good, p) {
				var sp = C.path_name(p);

				print(p + ' -> ' + sp);
				this.assertEq(sp, sp_good, 'sp != sp_good for (' + p + ')');
			}, this);

			this.done();
		}
	}, {
		name: 'open',
		run: function() {
			var test = this;
			var session = new Session();

			session.setCredentials('mt4@megous.com', 'qwe');

			Defer.chain([

				function() {
					return session.open().done(function() {
						Log.debug('session.open.done:', session.data);
					});
				},

				function() {
					return session.fs.load().done(function() {
						session.save();
					});
				}

			]).then(function() {
				test.done();
			}, function(code, message) {
				test.fail(code + ': ' + message);
			});
		}
	}, {
		name: 'ino',
		run: function() {
			var handles = ['XNtUATTD', 'bN1gAawa', 'icVVwDZI'];

			_(handles).each(function(hok) {
				var ino = C.handle_to_inode(hok);
				var h = C.inode_to_handle(ino);

				print(hok + ': ' + ino);
				this.assertEq(hok, h, 'hok != h');
			}, this);

			this.done();
		}
	}]
});

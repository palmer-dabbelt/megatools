GW.define('TestSuite.Session', 'TestSuite', {
	name: 'session',

	getTests: function() {
		return [{
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

					this.log(p + ' -> ' + sp);
					this.assertEq(sp, sp_good, 'sp != sp_good');
				}, this);
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

					this.log(p + ' -> ' + sp);
					this.assertEq(sp, sp_good, 'sp != sp_good');
				}, this);
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

					this.log(p + ' -> ' + sp);
					this.assertEq(sp, sp_good, 'sp != sp_good for (' + p + ')');
				}, this);
			}
		}, {
			name: 'open',
			run: function(test) {
				var session = new Session();
				session.setCredentials('mt4@megous.com', 'qwe');

				return session.open(true).then(function() {
					test.log('session.open.done:', session.data);

					return session.getFilesystem().load();
				});
			}
		}, {
			name: 'ino',
			run: function() {
				var handles = ['XNtUATTD', 'bN1gAawa', 'icVVwDZI'];

				_(handles).each(function(hok) {
					var ino = C.handle_to_inode(hok);
					var h = C.inode_to_handle(ino);

					this.log(hok + ': ' + ino);
					this.assertEq(hok, h, 'hok != h');
				}, this);
			}
		}];
	}
});

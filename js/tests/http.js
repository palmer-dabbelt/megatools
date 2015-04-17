GW.define('TestSuite.Http', 'TestSuite', {
	name: 'http',

	getTests: function() {
		return [{
			name: 'get',
			run: function() {
				var test = this;
				var i;

				function request() {
					return Defer.defer(function(defer) {
						C.http({
							url: 'http://localhost/data',
							onload: function(data) {
								defer.resolve(data);
							},
							onerror: function(code, msg) {
								defer.msg = msg;
								defer.reject(code, msg);
							}
						});
					});
				}

				var requests = [];
				for (i = 0; i < 100; i++) {
					requests.push(request());
				}

				return Defer.when(requests).done(function(resolved, rejected) {
					if (rejected.length > 0) {
						var msg = _.map(rejected, function(d) {
							return d.msg;
						}).join('\n');

						return Defer.rejected('fail', msg);
					}
				});
			}
		}, {
			name: 'inc',
			run: function() {
				var test = this;
				var i;

				function request() {
					return Defer.defer(function(defer) {
						var offset = 0;
						var reqBody = Duktape.Buffer('Lékaři předepisovali opiátové náplasti, od výrobce dostali miliony');
						var buffers = [];

						C.http({
							incremental: true,
							//method: 'POST',
							url: 'http://localhost/data',
							headers: {
								'Content-Length': reqBody.length
							},
							onpullbody: function() {
								this.push_body(C.slicebuf(reqBody, offset, 10));
								offset += 10;
							},
							onrecvheaders: function(headers) {
								this.next();
							},
							onrecvbody: function(data) {
								buffers.push(data);
								this.next();
							},
							onload: function() {
								var buf = C.joinbuf.apply(null, buffers);
								//print(buf.toString());
								defer.resolve();
							},
							onerror: function(err) {
								defer.reject(err);
							}
						});
					});
				}

				var requests = [];
				for (i = 0; i < 100; i++) {
					requests.push(request());
				}

				return Defer.when(requests).done(function(resolved, rejected) {
					if (rejected.length > 0) {
						var msg = _.map(rejected, function(d) {
							return d.msg;
						}).join('\n');

						return Defer.rejected('fail', msg);
					}
				});
			}
		}];
	}
});

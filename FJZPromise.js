(function(global) {
	//promise 状态对象共计三种，如下所定义，默认pending,promise状态仅支持由 pending->resoved 或 pending->rejected转换
	const PENDING = 'pending';
	const RESOLVED = 'resolved';
	const REJECTED = 'rejected';
	/* 
	resolvePromise作用是用来解析then方法添加的回调的返回值，运行 resolvePromise(retValue, promise, resolve, reject) 需遵循以下步骤：

	1。retValue 与 promise 相等
		如果 promise 和 retValue 指向同一对象，造成循环引用，为避免此种引用，以 TypeError 为据因拒绝执行 promise。
	2。retValue 为 一个新的 Promise，则使 promise 接受 retValue 的状态。
		A，retValue 处于等待态pending， 则promise 需保持为等待态直至 retValue 被执行（resolve）或拒绝（reject）。
		B，retValue 处于执行态，则用相同的值执行 promise。
		C，retValue 处于拒绝态，则用相同的据因拒绝 promise。
	3。retValue 为对象或函数，则判断retValue是否为thenable对象或thenable函数：
		一，是thenable函数或thenable对象
			则执行：
			const then = retValue.then
			let isCalled = false //避免多次调用，相当于开关
			then.call(
				retValue,
				(value) => {
					if (isCalled) return;
					isCalled = true;
					resolvePromise(value, promise, resolve, reject);
				},
				(reason) => {
					if (isCalled) return;
					isCalled = true;
					reject(reason);
				}
			);
			由上述代码可知，then方法以thenable对象或thenable函数为this上下文并传递两个回调分别是成功（onFulfilled）和失败（onRejected）回调来执行then函数：
			如果成功执行未报错，则
				A，仅onFulfilled 以参数 value被调用，则该回调内部通过运行 执行resolvePromise(value, promise, resolve, reject)来解析返回值value
				B，仅 onRejected 以据因 reason 为参数被调用，则以据因 reason 拒绝 promise
				C，onFulfilled 和 onRejected 二者均被调用，或者被同一参数调用了多次，则优先采用首次调用并忽略剩下的调用
			否则执行then方法时抛出错误 reason ，则以 reason 为据因拒绝reject promise。
			
		二，非thenable对象或非thenable函数，则以 retValue 为参数resolve promise
	4，retValue 非对象且非函数，以 retValue 为参数resolve promise

	*/
	const resolvePromise = function(retValue, promise, resolve, reject) {
		//作用是解析then方法添加的回调的返回值
		/* 
            params description: 
            @retValue:回调返回值，根据类型不同，区别解析
            @promise:promise 实例对象
            @resolve:promise对象对应的resolve函数
            @reject:promise对象对应的reject函数
        */
		if (retValue === promise) {
			//第1个步骤,retValue 与 promise 是同一个对象，则出现循环引用，reject promise
			return reject(new TypeError('error'));
		} else if (retValue instanceof FJZPromise) {
			//第2个步骤
			//2，retValue 为一个promise
			if (retValue.status === PENDING) {
				//第2-A步骤
				//返回值retValue作为promise对象，处于pending 状态
				retValue.then(
					(value) => {
						//针对返回值value 继续解析
						resolvePromise(value, promise, resolve, reject);
					},
					(reason) => {
						reject(reason);
					}
				);
			} else {
				//第2-B，C步骤
				//返回值retValue作为promise对象,非pengding 状态，即resolved 或 rejected状态，说明retValue这个promise对应的resolve value已经解析完成，故不必二次解析
				retValue.then(
					(value) => {
						resolve(value);
					},
					(reason) => {
						reject(reason);
					}
				);
			}
		} else if (
			retValue &&
			(Object.prototype.toString.call(retValue) === '[object Object]' ||
				Object.prototype.toString.call(retValue) === '[object Function]')
		) {
			//第3个步骤，即retValue 是一个thenable对象 或者 thenable函数（即具有then方法的对象或函数）
			const then = retValue.then;
			let isCalled = false; //避免重复调用
			if (typeof then === 'function') {
				//第3-一 步骤
				try {
					//thenable 对象或拥有then方法的函数，则以retValue作为this上下文调用
					then.call(
						retValue,
						(value) => {
							if (isCalled) return;
							isCalled = true;
							resolvePromise(value, promise, resolve, reject);
						},
						(reason) => {
							if (isCalled) return;
							isCalled = true;
							reject(reason);
						}
					);
				} catch (e) {
					reject(e);
				}
			} else {
				//第3-二步骤
				//变量then非函数，则直接以retValue作为值 resove
				resolve(retValue);
			}
		} else {
			//第4个步骤
			//retValue是一个非promise，非thenable对象或方法，则直接resolve
			resolve(retValue);
		}
	};
	class FJZPromise {
		static all(promises) {
			const promiseRetValues = [];
			let count = 0;
			return new FJZPromise((resolve, reject) => {
				if (Object.prototype.toString.call(promises) === '[object Array]') {
					const promisesLen = promises.length;
					promises.forEach((promise, index) => {
						if (promise instanceof FJZPromise) {
							promise.then(
								(value) => {
									promiseRetValues[index] = value;
									count++;
									if (count === promisesLen) {
										//相等说明promise已经全部resolve，则resolve promiseRetValues
										resolve(promiseRetValues);
									}
								},
								(reason) => {
									reject(reason);
								}
							);
						} else {
							//非promise
							promiseRetValues[index] = promise;
							count++;
							if (count === promisesLen) {
								resolve(promiseRetValues);
							}
						}
					});
				} else {
					reject(
						new TypeError(
							'The only argument must be an Array type which includes numbers of promise object'
						)
					);
				}
			});
		}
		static race(promises) {
			return new FJZPromise((resolve, reject) => {
				(promises || []).forEach((promise) => {
					promise.then(
						(value) => {
							resolve(value);
						},
						(reason) => reject(reason)
					);
				});
			});
		}
		static resolve(value) {
			return new FJZPromise((resolve, reject) => {
				resolve(value);
			});
		}
		static reject(reason) {
			return new FJZPromise((resolve, reject) => {
				reject(reason);
			});
		}
		constructor(excutor) {
			this.value = ''; //存储resolve value
			this.reason = ''; //存储reject reason
			this.status = PENDING; //默认promise状态未pending
			this.resolvedCallbacks = []; //成功回调队列
			this.rejectedCallbacks = []; //失败回调队列
			const resolve = (value) => {
				//resolve func
				if (value instanceof FJZPromise) {
					//value 为promise，表明值未被解析
					value.then(resolve, reject);
					return;
				}
				//promise 规范规定，resolve or reject 必须异步执行
				setTimeout(() => {
					if (this.status === PENDING) {
						this.status = RESOLVED;
						this.value = value;
						this.resolvedCallbacks.forEach((resolveCallback) => {
							resolveCallback(this.value);
						});
					}
				});
			};
			const reject = (reason) => {
				//reject func
				//promise 规范规定，resolve or reject 必须异步执行
				setTimeout(() => {
					if (this.status === PENDING) {
						this.reason = reason;
						this.status = REJECTED;
						this.rejectedCallbacks.forEach((rejectCallback) => {
							rejectCallback(this.reason);
						});
					}
				});
			};
			try {
				excutor(resolve, reject);
			} catch (err) {
				reject(err);
			}
		}
		then(onFulfilled, onRejected) {
			/* 
            1.then方法必须返回一个全新newPromise对象，不能直接return this
            
            2.如果 onFulfilled 或者 onRejected 返回一个值 retValue ，则运行 resolvePromise(retValue,newPromise,resolve,reject) 解决过程：
            
            3.如果 onFulfilled 或者 onRejected 抛出一个异常 e ，则 newPromise 必须拒绝执行，并返回拒因 e。
            
            4.如果 onFulfilled 不是函数且 promise1 成功执行， newPromise 必须成功执行并返回相同的值。
            
            5.如果 onRejected 不是函数且 promise1 拒绝执行， newPromise 必须拒绝执行并返回相同的据因。
            
            6.不论 上一个promise 被 reject 还是被 resolve 时， newPromise 都会被 resolve，只有出现异常时才会被 rejected。
            */

			//针对上述第4，5条规范，若onFulfilled 或 onRejected 非函数，则忽略，取默认值，即原样返回resolve value值

			onFulfilled =
				typeof onFulfilled === 'function' ? onFulfilled : (value) => value;
			onRejected =
				typeof onRejected === 'function'
					? onRejected
					: (reason) => {
							throw reason;
					  };

			//then 方法添加成功或失败回调时，得判断promise 状态来动态区分处理
			if (this.status === RESOLVED) {
				//promise 已经被resolve，状态pending->resoved
				const newPromise = new FJZPromise((resolve, reject) => {
					setTimeout(() => {
						try {
							//针对上述第3条规范,onFulfilled错误捕获--resolve
							//直接执行onFulfilled,以resolve value 值
							const retValue = onFulfilled(this.value);
							//retValue 表示成功回调的返回值，根据返回值类型进行区别解析：
							resolvePromise(retValue, newPromise, resolve, reject); //针对第6条规范
						} catch (e) {
							reject(e);
						}
					});
				});
				return newPromise; //针对第1条规范，返回一个全新promise
			} else if (this.status === REJECTED) {
				//promise 已经被reject，状态pending->rejected
				const newPromise = new FJZPromise((resolve, reject) => {
					setTimeout(() => {
						try {
							//针对上述第3条规范，onRejected错误捕获--reject
							//直接执行onRejected,以reject reason 值
							const retValue = onRejected(this.reason);
							//retValue 表示失败回调的返回值，根据返回值类型进行区别解析：
							resolvePromise(retValue, newPromise, resolve, reject); //针对第6条规范
						} catch (e) {
							reject(e);
						}
					});
				});
				return newPromise;
			} else {
				//promise状态为 pending,则将onFulfilled 和 onRejected回调改造后添加到对应的回调队列
				const newPromise = new FJZPromise((resolve, reject) => {
					this.resolvedCallbacks.push((value) => {
						try {
							//针对上述第3条规范，onFulfilled错误捕获---pending
							const retValue = onFulfilled(value);
							resolvePromise(retValue, newPromise, resolve, reject);
						} catch (e) {
							reject(e);
						}
					});
					this.rejectedCallbacks.push((reason) => {
						try {
							//针对上述第3条规范，onRejected错我捕获
							const retValue = onRejected(reason);
							resolvePromise(retValue, newPromise, resolve, reject);
						} catch (e) {
							reject(e);
						}
					});
				});
				return newPromise;
			}
		}
		catch(onRejected) {
			return this.then(null, onRejected);
		}
		finally(callbackFn) {
			const constructor = this.constructor;
			return this.then(
				(value) => {
					constructor.resolve(callbackFn).then(() => value);
				},
				(reason) => {
					constructor.resolve(callbackFn).then(() => {
						throw reason;
					});
				}
			);
		}
	}
	global.FJZPromise = FJZPromise; //挂在到全局，提供访问入口
})(window);
function load(url,intervals){
	return new Promise(resolve=>{
		setTimeout(()=>{
			resolve("load-"+url)
		},intervals)
	})
}
function loadResource(urls,maxRequest){
	let len = urls.length
	return new Promise(resolve=>{
		let count = 0;
		let _maxRequest = maxRequest
		let retVal = []
		const next = (url,index)=>{
			load(url,1000*len--).then(val=>{
				count++;
				retVal[index] = val
				if(_maxRequest<urls.length){
					next(urls[_maxRequest],_maxRequest)
					_maxRequest++
				}
				if(count>=urls.length){
					resolve(retVal)
					return
				}
			})
		}
		while(maxRequest--){
			next(urls[maxRequest],maxRequest)
		}
	})
}

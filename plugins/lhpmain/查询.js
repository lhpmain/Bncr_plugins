/**
 * @author Aming
 * @name 查询
 * @team Aming
 * @version v1.1.5
 * @description 奶酪_资产查询 移植于ccwav
 * @name 奶酪-资产查询
 * @rule ^(查询|豆豆|红包查询) ([0-9]+) ?([0-9]+)?$
 * @rule ^(查询|豆豆|红包查询|白嫖检索)$
 * @rule ^(设置豆豆显示上限) ([0-9]+)$
 * @rule ^(历史收入) ([0-9]+) ?([0-9]+)? ?([0-9]+)?
 * @admin true
 * @public true
 * @priority 99999
 * @classification ["插件"]
 * @disable false
 *
 *  
 说明：
    1.用户绑定平台信息：未用奶酪—Ark登录工具登录的属于未绑定用户（原芝士绑定信息清安装迁移插件）
    2.此插件依赖本仓库模块：（请更新或安装以下所有模块）
        ·AmQlMod
        ·AmToolMod
        .CryptoJS
        .USER_AGENTS
    3.命令说明：
     查询     ：查询发消息的这个人的id绑定的所有pin的资产 （非管理员命令）
     查询 1   ：查询面板管理中设置的默认面板中的第1个ck的资产 （管理员命令）
     查询 1 2 ：查询面板管理中设置的第2个面板中的第1个ck的资产 （管理员命令）
    -
     豆豆：同上（输出格式与AUTO_SPY 豆 n类似）
     历史收入 几天 几号ck 几号面板
    -
     红包查询：同上
    -
     白嫖检索：触发此命令会立即读取所有绑定的pin来检索【成熟可领、未种、ck过期】如发生前三种情况，则推送至绑定的账号 （管理员命令）（可通过本仓库的定时任务-红灯区插件实现定时检索）


*/

//撤回消息等待时间，tgbot、wx目前傻妞不支持撤回
const deleteMsgTime = 20;

//白嫖检索时 红包过期超过多少通知，默认5
const redHighest = 5;

//调试开关
const deBug = true;

//自定义触发词，必须和页眉@rule对应，否则会无法触发，看不懂勿动！！
/**
     * 栗子 
     * const ruleOpt = {
        //查询命令
        query: 'cx',
        //豆豆命令
        bean: 'dd',
        //红包查询命令
        hongbao: 'rcx',
        //白嫖检索命令
        baipiao: 'bpjs'
       } 
     页眉则要改成：
     * rule ^(cx|dd|rcx) ([1-9]+) ([1-9]+)
     * rule ^(cx|dd|rcx) ([1-9]+)
     * rule ^(cx|dd|rcx,bpjs)$
     */
/* 默认值 */
const ruleOpt = {
    //查询命令
    query: '查询',
    //豆豆命令
    bean: '豆豆',
    //红包查询命令
    hongbao: '红包查询',
    //白嫖检索命令
    baipiao: '白嫖检索',
    lishi: '历史收入',
};

const AmTool = require('./mod/AmTool');
const QlMod = require('./mod/AmQlMod');
const UA = require('./mod/USER_AGENTS');
const AmingScriptQl = new BncrDB('AmingScriptQl');
const pinDB = new BncrDB('pinDB');
module.exports = async s => {
    /* 检测模块并安装 */
    await sysMethod.testModule(['got@11.8.5', 'crypto-js'], { install: true });

    const startTime = new Date().getTime();
    const msg = s.getMsg();

    let qlDb = await await QlMod.GetQlDataBase(),
        qlDbArr = qlDb['data'] ? qlDb['data'] : (qlDb['data'] = []),
        defaultNum = typeof qlDb['Default'] === 'number' ? qlDb['Default'] : 0,
        isMasking = await AmingScriptQl.get('isMasking', true),
        remarksOpen = await AmingScriptQl.get('remarksOpen', false),
        remarks = '';

    let form = s.getFrom();
    const userId = s.getUserId(),
        userName = s.getUserName(),
        chatId = s.getGroupId(),
        msgId = s.getMsgId();
    let pinStr = ``;

    function debug() {
        if (deBug && arguments.length > 0) console.log(...arguments);
    }

    let maxDay = 0,
        maxDayId = '';
    if (s.param(1) === '设置豆豆显示上限') {
        if (!(await s.isAdmin())) return;
        if (isNaN(s.param(2))) return s.reply('设置有误,必须为纯数字');
        AmingScriptQl.set('beanLimit', +s.param(2));
        return s.reply(`成功设置显示上限为:${s.param(2)}`);
    }
    const beanLimit = await AmingScriptQl.get('beanLimit');

    async function app() {
        if (qlDbArr.length === 0) return await s.reply('请先发“面板管理”添加面板');
        let qlNum, key;
        //如果存在第三个，则编号是3 如果 只有第二个，那序号是2
        if (s.param(3)) {
            if (isNaN(s.param(3))) return await s.reply('请输入正确数字');
            qlNum = s.param(3) - 1;
        } else qlNum = defaultNum;

        if (s.param(2)) {
            if (isNaN(s.param(2))) return await s.reply('请输入正确数字');
            key = s.param(2) - 1;
        } else key = -1;

        if (s.param(1) === ruleOpt.lishi) {
            if (isNaN(s.param(2))) return await s.reply('请输入正确天数');
            maxDay = +s.param(2);
            if (s.param(3)) {
                if (isNaN(s.param(3))) return await s.reply('请输入正ck号');
                key = s.param(3) - 1;
            } else key = 0;
            if (s.param(4)) {
                if (isNaN(s.param(4))) return await s.reply('请输入正确面板号');
                qlNum = s.param(4) - 1;
            } else qlNum = defaultNum;
        }

        if (qlNum > qlDbArr.length) return await s.reply('没有该序号面板');
        //找cookie
        let cookie = '',
            nowAllEnv = await QlMod.GetQlAllEnvs(qlDbArr, qlNum);
        if (!nowAllEnv.status) return await s.reply(nowAllEnv.msg);
        nowAllEnv = nowAllEnv.data;

        /* 白嫖检索 */
        if (s.param(1) === ruleOpt.baipiao) {
            if (!(await s.isAdmin())) return;
            if (s.getFrom() !== 'cron') await s.reply('请稍后~');

            for (const d of await pinDB.keys()) {
                let pinDbs1 = await pinDB.get(d);
                let pinArr = pinDbs1['Pin'] || [];
                for (const e of pinArr) {
                    // if (arrs.indexOf(e) !== -1) continue   //排重
                    // arrs.push(e)
                    cookie = GetPinCookie(nowAllEnv, e);
                    if (!cookie) continue;
                    debug('检索：', e);
                    let logsRes = await GoGetJdInfo(cookie, 'baipiao');
                    if (!logsRes) continue;
                    // 完善推送过期只推送一次 todo
                    if (logsRes.includes('已过期，请重新登录！')) {
                    }
                    debug(pinDbs1['Form'], pinDbs1['ID'], logsRes);
                    sysMethod.push({
                        platform: pinDbs1['Form'],
                        userId: pinDbs1['ID'],
                        msg: logsRes,
                    });
                    /* 随机延迟5秒 */
                    await sysMethod.sleep(AmTool.RandomTo2(1, 5));
                }
            }
            if (s.getFrom() !== 'cron')
                await s.reply(
                    `命令：${msg} 处理完成，共耗时 ${AmTool.StartToEndTime(startTime, Date.now())}，计时结束`
                );
            return;
        }
        // 查询 指定序号
        if (key !== -1) {
            if (!(await s.isAdmin())) return; //是否管理员
            let nowAllEnv1 = GetJdCookie(nowAllEnv),
                mark = '';
            if (!nowAllEnv1.length) return s.reply('该容器没有JD_COOKIE');
            else if (key < nowAllEnv1.length) {
                cookie = nowAllEnv1[key]['value'];
                if (s.param(1) == ruleOpt.bean) mark = '豆豆';
                else if (s.param(1) === ruleOpt.hongbao) mark = 'red';
                else if (s.param(1) === ruleOpt.lishi) {
                    maxDayId = await s.reply(`正在查询${maxDay}天收入....`);
                    mark = '历史收入';
                }
                await GoGetJdInfo(cookie, mark);
            } else return s.reply('序号大于JD_COOKIE数量');
        } else {
            //不查 指定序号
            let pinDbs = await pinDB.get(`${form}:${userId}`, '');
            if (!pinDbs) return await s.reply('未绑定,请先登录');
            let pinArr = pinDbs['Pin'] || [],
                mark = '';
            if (!pinArr.length) return await s.reply('未绑定,请先登录');
            for (const e of pinArr) {
                cookie = GetPinCookie(nowAllEnv, e);
                if (!cookie) {
                    await s.reply(`${e}不存在于面板${qlNum + 1}`);
                    continue;
                }
                if (s.param(1) == ruleOpt.bean) mark = '豆豆';
                else if (s.param(1) === ruleOpt.hongbao) mark = 'red';
                await GoGetJdInfo(cookie, mark);
                /* 随机延迟5秒 */
                await sysMethod.sleep(AmTool.RandomTo2(1, 5));
            }
        }
    }

    await app();

    //根据pin获取cookie
    function GetPinCookie(nowAllEnv, pin) {
        let cookie = '';
        for (const e of nowAllEnv)
            if (e['name'] === 'JD_COOKIE')
                if (e['value'].match(/(?<=pt_pin=)[^;]+/g)[0] === pin) {
                    cookie = e['value'];
                    break;
                }
        if (cookie) return cookie;
        return null;
    }

    //提取所有jdcookie
    function GetJdCookie(nowAllEnv) {
        let cookie = [];
        for (const e of nowAllEnv) if (e['name'] === 'JD_COOKIE') cookie.push(e);
        return cookie;
    }
    /* 移植于ccwav */
    async function GoGetJdInfo(cookieS, mark = '') {
        const $ = new Env('查询');
        let ReturnMessage = '';
        let ReturnMessageMonth = '';
        let ReturnMessageTitle = '';
        const JD_API_HOST = 'https://api.m.jd.com/client.action';
        let intPerSent = 0;
        let i = 0;
        let llShowMonth = false;
        let Today = new Date();
        let strAllNotify = '';
        let strSubNotify = '';
        let llPetError = false;
        let strGuoqi = '';

        let WP_APP_TOKEN_ONE = '';

        let TempBaipiao = '';
        let llgeterror = false;

        //喜豆查询
        let EnableJxBeans = true;
        //汪汪乐园
        let EnableJoyPark = false;
        //京东赚赚
        let EnableJdZZ = true;
        //东东农场
        let EnableJdFruit = true;
        //特价金币
        let EnableJdSpeed = true;
        // 京东工厂
        let EnableJDGC = true;
        //领现金
        let EnableCash = true;
        //金融养猪
        let EnablePigPet = false;
        //7天过期京豆
        let EnableOverBean = true;
        //查优惠券
        let EnableChaQuan = true;
        //汪汪赛跑
        let EnableJoyRun = true;
        //京豆收益查询
        let EnableCheckBean = true;
        //点点券
        let EnableCoupon = true;

        Date.prototype.Format = function (fmt) {
            var e,
                n = this,
                d = fmt,
                l = {
                    'M+': n.getMonth() + 1,
                    'd+': n.getDate(),
                    'D+': n.getDate(),
                    'h+': n.getHours(),
                    'H+': n.getHours(),
                    'm+': n.getMinutes(),
                    's+': n.getSeconds(),
                    'w+': n.getDay(),
                    'q+': Math.floor((n.getMonth() + 3) / 3),
                    'S+': n.getMilliseconds(),
                };
            /(y+)/i.test(d) &&
                (d = d.replace(RegExp.$1, ''.concat(n.getFullYear()).substr(4 - RegExp.$1.length)));
            for (var k in l) {
                if (new RegExp('('.concat(k, ')')).test(d)) {
                    var t,
                        a = 'S+' === k ? '000' : '00';
                    d = d.replace(
                        RegExp.$1,
                        1 == RegExp.$1.length ? l[k] : (''.concat(a) + l[k]).substr(''.concat(l[k]).length)
                    );
                }
            }
            return d;
        };

        let cookie = cookieS;
        $.pt_pin = cookie.match(/pt_pin=([^; ]+)(?=;?)/) && cookie.match(/pt_pin=([^; ]+)(?=;?)/)[1];
        $.UserName = decodeURIComponent(
            cookie.match(/pt_pin=([^; ]+)(?=;?)/) && cookie.match(/pt_pin=([^; ]+)(?=;?)/)[1]
        );
        $.CryptoJS = require('crypto-js');
        $.index = i + 1;
        $.beanCount = 0;
        $.incomeBean = 0;
        $.expenseBean = 0;
        $.todayIncomeBean = 0;
        $.todayOutcomeBean = 0;
        $.errorMsg = '';
        $.isLogin = true;
        $.nickName = '';
        $.levelName = '';
        $.message = '';
        $.balance = 0;
        $.expiredBalance = 0;
        $.JdzzNum = 0;
        $.JdFarmProdName = '';
        $.JdtreeEnergy = 0;
        $.JdtreeTotalEnergy = 0;
        $.treeState = 0;
        $.JdwaterTotalT = 0;
        $.JdwaterD = 0;
        $.JDwaterEveryDayT = 0;
        $.JDtotalcash = 0;
        $.JDEggcnt = 0;
        $.Jxmctoken = '';
        $.DdFactoryReceive = '';
        $.jxFactoryInfo = '';
        $.jxFactoryReceive = '';
        $.jdCash = 0;
        $.isPlusVip = false;
        $.isRealNameAuth = false;
        $.JingXiang = '';
        $.allincomeBean = 0; //月收入
        $.allexpenseBean = 0; //月支出
        $.joylevel = 0;
        $.beanChangeXi = 0;
        $.inJxBean = 0;
        $.OutJxBean = 0;
        $.todayinJxBean = 0;
        $.todayOutJxBean = 0;
        $.xibeanCount = 0;
        $.PigPet = '';
        $.YunFeiTitle = '';
        $.YunFeiQuan = 0;
        $.YunFeiQuanEndTime = '';
        $.YunFeiTitle2 = '';
        $.YunFeiQuan2 = 0;
        $.YunFeiQuanEndTime2 = '';
        $.JoyRunningAmount = '';
        $.ECardinfo = '';
        $.PlustotalScore = 0;
        $.CheckTime = '';
        $.beanCache = 0;
        TempBaipiao = '';
        strGuoqi = '';
        $.CoupontotalAmount = 0;

        let userName = '';

        if (remarksOpen) {
            remarks = await GetQlRemarks($.pt_pin);
            if (remarks) remarks = remarks.split('@@')[0] || '';
        }

        userName = remarks
            ? remarks
            : isMasking
            ? AmTool.Masking($.nickName || $.UserName, 1, 1)
            : $.nickName || $.UserName;

        // console.log(`******开始查询【${userName}】*********`);

        await TotalBean();
        if ($.beanCount == 0) {
            console.log('数据获取失败，等待5秒后重试....');
            await $.wait(5 * 1000);
            await TotalBean();
        }
        if ($.beanCount == 0) {
            console.log('疑似获取失败,等待5秒后用第二个接口试试....');
            await $.wait(5 * 1000);
            var userdata = await getuserinfo();
            if (userdata.code == 1) {
                $.beanCount = userdata.content.jdBean;
            }
        }
        if (!$.isLogin) await isLoginByX1a0He();
        if (!$.isLogin) {
            if (mark === 'baipiao') return userName + ' 已过期，请重新登录！';
            return s.reply(userName + ' 已过期，请重新登录！');
        }

        var llfound = false;
        var timeString = '';
        var nowHour = new Date().getHours();
        var nowMinute = new Date().getMinutes();
        if (nowHour < 10) timeString += '0' + nowHour + ':';
        else timeString += nowHour + ':';
        if (nowMinute < 10) timeString += '0' + nowMinute;
        else timeString += nowMinute;

        if (mark === '') {
            await Promise.all([
                getjdfruitinfo(), //东东农场
                // getJoyBaseInfo(), //汪汪乐园
                // getJdZZ(), //京东赚赚
                cash(), //特价金币
                bean(), //京豆查询
                // getDdFactoryInfo(), // 京东工厂
                jdCash(), //领现金
                GetJxBeaninfo(), //喜豆查询
                GetPigPetInfo(), //金融养猪
                GetJoyRuninginfo(), //汪汪赛跑
                // getCouponConfig(), //点点券
                queryScores(),
                redPacket(), //红包
            ]);
            await showMsg();
        } else if (mark === 'red') {
            await redPacket();
            ReturnMessage = `【账号名称】${userName}\n`;
            ReturnMessage += `${$.message}`;
            let msgid1 = s.reply(ReturnMessage);
            /* 撤销 */
            if (deleteMsgTime !== 0) s.delMsg(msgId, msgid1, { wait: deleteMsgTime });
        } else if (mark === 'baipiao') {
            //检查账号是否有成熟的东西收取
            let msg = ``;
            await Promise.all([getjdfruitinfo(), redPacket()]);
            if ($.JdFarmProdName != '' && !$.jdFruitErr) {
                if ($.JdtreeEnergy != 0) {
                    if ($.treeState === 2 || $.treeState === 3)
                        msg += `东东农场：${$.JdFarmProdName} 可以兑换了!\n`;
                } else {
                    if ($.treeState === 0) msg += `东东农场：水果领取后未重新种植!\n`;
                }
            }
            // log(jxRedExpire,jsRedExpire,jdRedExpire,jdhRedExpire)
            if ($.jxRedExpire > 0 && $.jxRedExpire >= redHighest)
                msg += `京喜红包：将过期${$.jxRedExpire.toFixed(2)}元\n`;
            if ($.jsRedExpire > 0 && $.jsRedExpire >= redHighest)
                msg += `极速红包：将过期${$.jsRedExpire.toFixed(2)}元\n`;
            if ($.jdRedExpire > 0 && $.jdRedExpire >= redHighest)
                msg += `京东红包：将过期${$.jdRedExpire.toFixed(2)}元\n`;
            if ($.jdhRedExpire > 0 && $.jdhRedExpire >= redHighest)
                msg += `健康红包：将过期${$.jdhRedExpire.toFixed(2)}元\n`;
            if ($.jdwxRedExpire > 0 && $.jdwxRedExpire >= redHighest)
                msg += `微信小程序：将过期${$.jdwxRedExpire.toFixed(2)}元\n`;
            if ($.jdGeneralRedExpire > 0 && $.jdGeneralRedExpire >= redHighest)
                msg += `全平台通用：将过期${$.jdGeneralRedExpire.toFixed(2)}元 \n`;

            if (msg !== '') {
                return `【${userName}】\n${msg}`;
            }
        } else if (['豆豆', '历史收入'].includes(mark)) return await GetDayBend();
        async function showMsg() {
            ReturnMessage = '';
            var strsummary = '';
            ReturnMessageTitle = `【账号名称】${userName}`;
            if ($.JingXiang) {
                if ($.isRealNameAuth)
                    if (cookie.includes('app_open')) ReturnMessageTitle += `(wskey已实名)\n`;
                    else ReturnMessageTitle += `(已实名)\n`;
                else if (cookie.includes('app_open')) ReturnMessageTitle += `(wskey未实名)\n`;
                else ReturnMessageTitle += `(未实名)\n`;

                ReturnMessage += `【账号信息】`;
                if ($.isPlusVip) {
                    ReturnMessage += `Plus会员`;
                    if ($.PlustotalScore) ReturnMessage += `(${$.PlustotalScore}分)`;
                } else {
                    ReturnMessage += `普通会员`;
                }
                ReturnMessage += `,京享值${$.JingXiang}\n`;
            } else {
                ReturnMessageTitle += `\n`;
            }
            if (llShowMonth) {
                ReturnMessageMonth = ReturnMessage;
                ReturnMessageMonth += `\n【上月收入】：${$.allincomeBean}京豆 🐶\n`;
                ReturnMessageMonth += `【上月支出】：${$.allexpenseBean}京豆 🐶\n`;
                console.log(ReturnMessageMonth);
            }
            if (EnableCheckBean) {
                ReturnMessage += `【今日京豆】收${$.todayIncomeBean}豆`;
                strsummary += `【今日京豆】收${$.todayIncomeBean}豆`;
                if ($.todayOutcomeBean != 0) {
                    ReturnMessage += `,支${$.todayOutcomeBean}豆`;
                    strsummary += `,支${$.todayOutcomeBean}豆`;
                }
                ReturnMessage += `\n`;
                strsummary += `\n`;
                ReturnMessage += `【昨日京豆】收${$.incomeBean}豆`;

                if ($.expenseBean != 0) {
                    ReturnMessage += `,支${$.expenseBean}豆`;
                }
                ReturnMessage += `\n`;
            }

            if ($.beanCount) {
                ReturnMessage += `【当前京豆】${$.beanCount - $.beanChangeXi}豆(≈${(
                    ($.beanCount - $.beanChangeXi) /
                    100
                ).toFixed(2)}元)\n`;
                strsummary += `【当前京豆】${$.beanCount - $.beanChangeXi}豆(≈${(
                    ($.beanCount - $.beanChangeXi) /
                    100
                ).toFixed(2)}元)\n`;
            } else {
                if ($.levelName || $.JingXiang) ReturnMessage += `【当前京豆】获取失败,接口返回空数据\n`;
                else {
                    ReturnMessage += `【当前京豆】${$.beanCount - $.beanChangeXi}豆(≈${(
                        ($.beanCount - $.beanChangeXi) /
                        100
                    ).toFixed(2)}元)\n`;
                    strsummary += `【当前京豆】${$.beanCount - $.beanChangeXi}豆(≈${(
                        ($.beanCount - $.beanChangeXi) /
                        100
                    ).toFixed(2)}元)\n`;
                }
            }

            if (EnableJxBeans) {
                if ($.todayinJxBean || $.todayOutJxBean) {
                    ReturnMessage += `【今日喜豆】收${$.todayinJxBean}豆`;
                    if ($.todayOutJxBean != 0) {
                        ReturnMessage += `,支${$.todayOutJxBean}豆`;
                    }
                    ReturnMessage += `\n`;
                }
                if ($.inJxBean || $.OutJxBean) {
                    ReturnMessage += `【昨日喜豆】收${$.inJxBean}豆`;
                    if ($.OutJxBean != 0) {
                        ReturnMessage += `,支${$.OutJxBean}豆`;
                    }
                    ReturnMessage += `\n`;
                }
                ReturnMessage += `【当前喜豆】${$.xibeanCount}喜豆(≈${($.xibeanCount / 100).toFixed(2)}元)\n`;
                strsummary += `【当前喜豆】${$.xibeanCount}豆(≈${($.xibeanCount / 100).toFixed(2)}元)\n`;
            }

            if ($.JDEggcnt) {
                ReturnMessage += `【京喜牧场】${$.JDEggcnt}枚鸡蛋\n`;
            }
            if ($.JDtotalcash) {
                ReturnMessage += `【特价金币】${$.JDtotalcash}币(≈${($.JDtotalcash / 10000).toFixed(2)}元)\n`;
            }
            if ($.JdzzNum) {
                ReturnMessage += `【京东赚赚】${$.JdzzNum}币(≈${($.JdzzNum / 10000).toFixed(2)}元)\n`;
            }

            if ($.ECardinfo) ReturnMessage += `【礼卡余额】${$.ECardinfo}\n`;

            if ($.JoyRunningAmount) ReturnMessage += `【汪汪赛跑】${$.JoyRunningAmount}元\n`;

            if ($.JdFarmProdName != '') {
                if ($.JdtreeEnergy != 0) {
                    if ($.treeState === 2 || $.treeState === 3) {
                        ReturnMessage += `【东东农场】${$.JdFarmProdName} 可以兑换了!\n`;
                        TempBaipiao += `【东东农场】${$.JdFarmProdName} 可以兑换了!\n`;
                    } else {
                        if ($.JdwaterD != 'Infinity' && $.JdwaterD != '-Infinity') {
                            ReturnMessage += `【东东农场】${$.JdFarmProdName}(${(
                                ($.JdtreeEnergy / $.JdtreeTotalEnergy) *
                                100
                            ).toFixed(0)}%,${$.JdwaterD}天)\n`;
                        } else {
                            ReturnMessage += `【东东农场】${$.JdFarmProdName}(${(
                                ($.JdtreeEnergy / $.JdtreeTotalEnergy) *
                                100
                            ).toFixed(0)}%)\n`;
                        }
                    }
                } else {
                    if ($.treeState === 0) {
                        TempBaipiao += `【东东农场】水果领取后未重新种植!\n`;
                    } else if ($.treeState === 1) {
                        ReturnMessage += `【东东农场】${$.JdFarmProdName}种植中...\n`;
                    } else {
                        TempBaipiao += `【东东农场】状态异常!\n`;

                        //ReturnMessage += `【东东农场】${$.JdFarmProdName}状态异常${$.treeState}...\n`;
                    }
                }
            }
            if ($.jxFactoryInfo) {
                ReturnMessage += `【京喜工厂】${$.jxFactoryInfo}\n`;
            }
            if ($.ddFactoryInfo) {
                ReturnMessage += `【东东工厂】${$.ddFactoryInfo}\n`;
            }
            if ($.DdFactoryReceive) {
                TempBaipiao += `【东东工厂】${$.ddFactoryInfo} 可以兑换了!\n`;
            }
            if ($.jxFactoryReceive) {
                TempBaipiao += `【京喜工厂】${$.jxFactoryReceive} 可以兑换了!\n`;
            }

            if ($.PigPet) {
                TempBaipiao += `【金融养猪】${$.PigPet} 可以兑换了!\n`;
            }

            if ($.joylevel || $.jdCash || $.CoupontotalAmount) {
                ReturnMessage += `【其他信息】`;
                if ($.joylevel) {
                    ReturnMessage += `汪汪:${$.joylevel}级`;
                }
                if ($.jdCash) {
                    if ($.joylevel) {
                        ReturnMessage += ',';
                    }
                    ReturnMessage += `领现金:${$.jdCash}元`;
                }

                if ($.CoupontotalAmount) {
                    if ($.joylevel || $.jdCash) {
                        ReturnMessage += ',';
                    }
                    ReturnMessage += `点点券:${$.CoupontotalAmount}元`;
                }
                ReturnMessage += `\n`;
            }

            if (strGuoqi) {
                ReturnMessage += `临期京豆明细\n`;
                ReturnMessage += `${strGuoqi}`;
            }
            ReturnMessage += `【红包明细】\n`;
            ReturnMessage += `${$.message}`;
            strsummary += `${$.message}`;

            if ($.YunFeiQuan) {
                var strTempYF = '【免运费券】' + $.YunFeiQuan + '张';
                if ($.YunFeiQuanEndTime) strTempYF += '(有效期至' + $.YunFeiQuanEndTime + ')';
                strTempYF += '\n';
                ReturnMessage += strTempYF;
                strsummary += strTempYF;
            }
            if ($.YunFeiQuan2) {
                var strTempYF2 = '【免运费券】' + $.YunFeiQuan2 + '张';
                if ($.YunFeiQuanEndTime2) strTempYF += '(有效期至' + $.YunFeiQuanEndTime2 + ')';
                strTempYF2 += '\n';
                ReturnMessage += strTempYF2;
                strsummary += strTempYF2;
            }

            console.log('最终结果\n', `${ReturnMessageTitle + ReturnMessage}`);
            let msgid1 = await s.reply(`${ReturnMessageTitle + ReturnMessage}`);
            if (deleteMsgTime !== 0) s.delMsg(msgid1, msgId, { wait: deleteMsgTime });
            //$.msg($.name, '', ReturnMessage , {"open-url": "https://bean.m.jd.com/beanDetail/index.action?resourceValue=bean"});
        }
        async function bean() {
            if (EnableCheckBean) {
                // console.log(`北京时间零点时间戳:${parseInt((Date.now() + 28800000) / 86400000) * 86400000 - 28800000}`);
                // console.log(`北京时间2020-10-28 06:16:05::${new Date("2020/10/28 06:16:05+08:00").getTime()}`)
                // 不管哪个时区。得到都是当前时刻北京时间的时间戳 new Date().getTime() + new Date().getTimezoneOffset()*60*1000 + 8*60*60*1000

                //前一天的0:0:0时间戳
                const tm =
                    parseInt((Date.now() + 28800000) / 86400000) * 86400000 - 28800000 - 24 * 60 * 60 * 1000;
                // 今天0:0:0时间戳
                const tm1 = parseInt((Date.now() + 28800000) / 86400000) * 86400000 - 28800000;
                let page = 1,
                    t = 0,
                    yesterdayArr = [],
                    todayArr = [];
                do {
                    let response = await getJingBeanBalanceDetail(page);
                    await $.wait(100);
                    // console.log(`第${page}页: ${JSON.stringify(response)}`);
                    if (response && response.code === '0') {
                        page++;
                        let detailList = response.jingDetailList;
                        if (detailList && detailList.length > 0) {
                            for (let item of detailList) {
                                const date = item.date.replace(/-/g, '/') + '+08:00';
                                if (
                                    new Date(date).getTime() >= tm1 &&
                                    !item['eventMassage'].includes('退还') &&
                                    !item['eventMassage'].includes('物流') &&
                                    !item['eventMassage'].includes('扣赠')
                                ) {
                                    todayArr.push(item);
                                } else if (
                                    tm <= new Date(date).getTime() &&
                                    new Date(date).getTime() < tm1 &&
                                    !item['eventMassage'].includes('退还') &&
                                    !item['eventMassage'].includes('物流') &&
                                    !item['eventMassage'].includes('扣赠')
                                ) {
                                    //昨日的
                                    yesterdayArr.push(item);
                                } else if (tm > new Date(date).getTime()) {
                                    //前天的
                                    t = 1;
                                    break;
                                }
                            }
                        } else {
                            $.errorMsg = `数据异常`;
                            console.log(`${$.nickName}\n${$.errorMsg}`);
                            t = 1;
                        }
                    } else if (response && response.code === '3') {
                        console.log(`cookie已过期，或者填写不规范，跳出`);
                        t = 1;
                    } else {
                        console.log(`未知情况：${JSON.stringify(response)}`);
                        console.log(`未知情况，跳出`);
                        t = 1;
                    }
                } while (t === 0);
                for (let item of yesterdayArr) {
                    if (Number(item.amount) > 0) {
                        $.incomeBean += Number(item.amount);
                    } else if (Number(item.amount) < 0) {
                        $.expenseBean += Number(item.amount);
                    }
                }
                for (let item of todayArr) {
                    if (Number(item.amount) > 0) {
                        $.todayIncomeBean += Number(item.amount);
                    } else if (Number(item.amount) < 0) {
                        $.todayOutcomeBean += Number(item.amount);
                    }
                }
                $.todayOutcomeBean = -$.todayOutcomeBean;
                $.expenseBean = -$.expenseBean;
            }
            decExBean = 0;
            if (EnableOverBean) {
                await queryexpirejingdou(); //过期京豆
                // if (decExBean && doExJxBeans == "true") {
                //     var jxbeans = await exchangejxbeans(decExBean);
                //     if (jxbeans) {
                //         $.beanChangeXi = decExBean;
                //         console.log(`已为您将` + decExBean + `临期京豆转换成喜豆！`);
                //         strGuoqi += `已为您将` + decExBean + `临期京豆转换成喜豆！\n`;
                //     }
                // }
            }

            if (EnableChaQuan) await getCoupon();
        }

        async function Monthbean() {
            let time = new Date();
            let year = time.getFullYear();
            let month = parseInt(time.getMonth()); //取上个月
            if (month == 0) {
                //一月份，取去年12月，所以月份=12，年份减1
                month = 12;
                year -= 1;
            }

            //开始时间 时间戳
            let start = new Date(year + '-' + month + '-01 00:00:00').getTime();
            console.log(`计算月京豆起始日期:` + GetDateTime(new Date(year + '-' + month + '-01 00:00:00')));

            //结束时间 时间戳
            if (month == 12) {
                //取去年12月，进1个月，所以月份=1，年份加1
                month = 1;
                year += 1;
            }
            let end = new Date(year + '-' + (month + 1) + '-01 00:00:00').getTime();
            console.log(
                `计算月京豆结束日期:` + GetDateTime(new Date(year + '-' + (month + 1) + '-01 00:00:00'))
            );

            let allpage = 1,
                allt = 0,
                allyesterdayArr = [];
            do {
                let response = await getJingBeanBalanceDetail(allpage);
                await $.wait(100);
                // console.log(`第${allpage}页: ${JSON.stringify(response)}`);
                if (response && response.code === '0') {
                    allpage++;
                    let detailList = response.jingDetailList;
                    if (detailList && detailList.length > 0) {
                        for (let item of detailList) {
                            const date = item.date.replace(/-/g, '/') + '+08:00';
                            if (start <= new Date(date).getTime() && new Date(date).getTime() < end) {
                                //日期区间内的京豆记录
                                allyesterdayArr.push(item);
                            } else if (start > new Date(date).getTime()) {
                                //前天的
                                allt = 1;
                                break;
                            }
                        }
                    } else {
                        $.errorMsg = `数据异常`;
                        console.log(`${$.nickName}\n${$.errorMsg}`);
                        allt = 1;
                    }
                } else if (response && response.code === '3') {
                    console.log(`cookie已过期，或者填写不规范，跳出`);
                    allt = 1;
                } else {
                    console.log(`未知情况：${JSON.stringify(response)}`);
                    console.log(`未知情况，跳出`);
                    allt = 1;
                }
            } while (allt === 0);

            for (let item of allyesterdayArr) {
                if (Number(item.amount) > 0) {
                    $.allincomeBean += Number(item.amount);
                } else if (Number(item.amount) < 0) {
                    $.allexpenseBean += Number(item.amount);
                }
            }
        }

        async function jdCash() {
            if (!EnableCash) return;
            let functionId = 'cash_homePage';
            let sign = `body=%7B%7D&build=167968&client=apple&clientVersion=10.4.0&d_brand=apple&d_model=iPhone13%2C3&ef=1&eid=eidI25488122a6s9Uqq6qodtQx6rgQhFlHkaE1KqvCRbzRnPZgP/93P%2BzfeY8nyrCw1FMzlQ1pE4X9JdmFEYKWdd1VxutadX0iJ6xedL%2BVBrSHCeDGV1&ep=%7B%22ciphertype%22%3A5%2C%22cipher%22%3A%7B%22screen%22%3A%22CJO3CMeyDJCy%22%2C%22osVersion%22%3A%22CJUkDK%3D%3D%22%2C%22openudid%22%3A%22CJSmCWU0DNYnYtS0DtGmCJY0YJcmDwCmYJC0DNHwZNc5ZQU2DJc3Zq%3D%3D%22%2C%22area%22%3A%22CJZpCJCmC180ENcnCv80ENc1EK%3D%3D%22%2C%22uuid%22%3A%22aQf1ZRdxb2r4ovZ1EJZhcxYlVNZSZz09%22%7D%2C%22ts%22%3A1648428189%2C%22hdid%22%3A%22JM9F1ywUPwflvMIpYPok0tt5k9kW4ArJEU3lfLhxBqw%3D%22%2C%22version%22%3A%221.0.3%22%2C%22appname%22%3A%22com.360buy.jdmobile%22%2C%22ridx%22%3A-1%7D&ext=%7B%22prstate%22%3A%220%22%2C%22pvcStu%22%3A%221%22%7D&isBackground=N&joycious=104&lang=zh_CN&networkType=3g&networklibtype=JDNetworkBaseAF&partner=apple&rfs=0000&scope=11&sign=98c0ea91318ef1313786d86d832f1d4d&st=1648428208392&sv=101&uemps=0-0&uts=0f31TVRjBSv7E8yLFU2g86XnPdLdKKyuazYDek9RnAdkKCbH50GbhlCSab3I2jwM04d75h5qDPiLMTl0I3dvlb3OFGnqX9NrfHUwDOpTEaxACTwWl6n//EOFSpqtKDhg%2BvlR1wAh0RSZ3J87iAf36Ce6nonmQvQAva7GoJM9Nbtdah0dgzXboUL2m5YqrJ1hWoxhCecLcrUWWbHTyAY3Rw%3D%3D`;
            return new Promise(resolve => {
                $.post(apptaskUrl(functionId, sign), async (err, resp, data) => {
                    try {
                        if (err) {
                            console.log(`${JSON.stringify(err)}`);
                            console.log(`jdCash API请求失败，请检查网路重试`);
                        } else {
                            if (safeGet(data)) {
                                data = JSON.parse(data);
                                if (data.code === 0 && data.data.result) {
                                    $.jdCash = data.data.result.totalMoney || 0;
                                    return;
                                }
                            }
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve(data);
                    }
                });
            });
        }

        function apptaskUrl(functionId = '', body = '') {
            return {
                url: `${JD_API_HOST}?functionId=${functionId}`,
                body,
                headers: {
                    'Cookie': cookie,
                    'Host': 'api.m.jd.com',
                    'Connection': 'keep-alive',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': '',
                    'User-Agent': 'JD4iPhone/167774 (iPhone; iOS 14.7.1; Scale/3.00)',
                    'Accept-Language': 'zh-Hans-CN;q=1',
                    'Accept-Encoding': 'gzip, deflate, br',
                },
                timeout: 10000,
            };
        }

        async function getCouponConfig() {
            if (!EnableCoupon) return;
            let functionId = `getCouponConfig`;
            let body = {
                childActivityUrl:
                    'openapp.jdmobile://virtual?params={"category":"jump","des":"couponCenter"}',
                incentiveShowTimes: 0,
                monitorRefer: '',
                monitorSource: 'ccresource_android_index_config',
                pageClickKey: 'Coupons_GetCenter',
                rewardShowTimes: 0,
                sourceFrom: '1',
            };
            let sign = await getSign(functionId, body);
            return new Promise(async resolve => {
                $.post(CoupontaskUrl(functionId, sign), async (err, resp, data) => {
                    try {
                        if (err) {
                            console.log(`${JSON.stringify(err)}`);
                            console.log(`${$.name} getCouponConfig API请求失败，请检查网路重试`);
                        } else {
                            if (data) {
                                data = JSON.parse(data);
                                if (data?.result?.couponConfig?.signNecklaceDomain?.roundData?.totalScore)
                                    $.CoupontotalAmount =
                                        data.result.couponConfig.signNecklaceDomain.roundData.totalScore;
                                $.CoupontotalAmount = ($.CoupontotalAmount / 1000).toFixed(2);
                            }
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve();
                    }
                });
            });
        }

        function getSign(functionId, body) {
            var strsign = '';
            let data = {
                fn: functionId,
                body: body,
            };
            return new Promise(resolve => {
                let url = {
                    url: 'https://api.nolanstore.top/sign',
                    body: JSON.stringify(data),
                    followRedirect: false,
                    headers: {
                        'Accept': '*/*',
                        'accept-encoding': 'gzip, deflate, br',
                        'Content-Type': 'application/json',
                    },
                    timeout: 30000,
                };
                $.post(url, async (err, resp, data) => {
                    try {
                        data = JSON.parse(data);
                        if (data && data.body) {
                            if (data.body) strsign = data.body || '';
                            if (strsign != '') resolve(strsign);
                            else console.log('签名获取失败.');
                        } else {
                            console.log('签名获取失败.');
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve(strsign);
                    }
                });
            });
        }

        function CoupontaskUrl(functionId, body) {
            return {
                url: `${JD_API_HOST}?functionId=${functionId}`,
                body,
                headers: {
                    'Host': 'api.m.jd.com',
                    'Connection': 'keep-alive',
                    'User-Agent':
                        'okhttp/3.12.1;jdmall;android;version/10.1.2;build/89743;screen/1080x2030;os/9;network/wifi;',
                    'Accept': '*/*',
                    'Referer': 'https://h5.m.jd.com/rn/42yjy8na6pFsq1cx9MJQ5aTgu3kX/index.html',
                    'Accept-Encoding': 'gzip, deflate',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Cookie': cookie,
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                },
            };
        }

        /* function TotalBean() {
            return new Promise(async resolve => {
                const options = {
                    url: "https://me-api.jd.com/user_new/info/GetJDUserInfoUnion",
                    headers: {
                        Cookie: cookie,
                        "User-Agent": "jdapp;iPhone;9.4.4;14.3;network/4g;Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1",
                    },
                    timeout: 10000
                }
                $.get(options, (err, resp, data) => {
                    try {
                        if (err) {
                            $.logErr(err)
                        } else {
                            console.log(data);
                            if (data) {
                                data = JSON.parse(data);
                                if (data['retcode'] === "1001") {
                                    $.isLogin = false; //cookie过期
                                    return;
                                }
                                if (data['retcode'] === "0" && data.data && data.data.hasOwnProperty("userInfo")) {
                                    $.nickName = data.data.userInfo.baseInfo.nickname;
                                    $.levelName = data.data.userInfo.baseInfo.levelName;
                                    $.isPlusVip = data.data.userInfo.isPlusVip;
        
                                }
                                if (data['retcode'] === '0' && data.data && data.data['assetInfo']) {
                                    if ($.beanCount == 0)
                                        $.beanCount = data.data && data.data['assetInfo']['beanNum'];
                                } else {
                                    $.errorMsg = `数据异常`;
                                }
                            } else {
                                $.log('京东服务器返回空数据,将无法获取等级及VIP信息');
                            }
                        }
                    } catch (e) {
                        $.logErr(e)
                    }
                    finally {
                        resolve();
                    }
                })
            })
        } */

        function TotalBean() {
            return new Promise(async resolve => {
                const options = {
                    url: `https://wq.jd.com/user/info/QueryJDUserInfo?sceneval=2`,
                    headers: {
                        'Accept': 'application/json,text/plain, */*',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Accept-Language': 'zh-cn',
                        'Connection': 'keep-alive',
                        'Cookie': cookie,
                        'Referer': 'https://wqs.jd.com/my/jingdou/my.shtml?sceneval=2',
                        'User-Agent': UA.USER_AGENT(),
                    },
                };
                $.post(options, (err, resp, data) => {
                    try {
                        if (err) {
                            console.log(`${JSON.stringify(err)}`);
                            console.log(`${$.name} API请求失败，请检查网路重试`);
                        } else {
                            if (data) {
                                data = JSON.parse(data);
                                if (data['retcode'] === 13) {
                                    $.isLogin = false; //cookie过期
                                    return;
                                }
                                if (data['retcode'] === 0) {
                                    $.nickName = (data['base'] && data['base'].nickname) || $.UserName;
                                    $.isPlusVip = data['isPlusVip'];
                                    $.isRealNameAuth = data['isRealNameAuth'];
                                    $.beanCount = (data['base'] && data['base'].jdNum) || 0;
                                    $.JingXiang = (data['base'] && data['base'].jvalue) || 0;
                                } else {
                                    $.nickName = $.UserName;
                                }
                            } else {
                                console.log(`京东服务器返回空数据`);
                            }
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve();
                    }
                });
            });
        }

        function TotalBean2() {
            return new Promise(async resolve => {
                const options = {
                    url: `https://wxapp.m.jd.com/kwxhome/myJd/home.json?&useGuideModule=0&bizId=&brandId=&fromType=wxapp&timestamp=${Date.now()}`,
                    headers: {
                        'Cookie': cookie,
                        'content-type': `application/x-www-form-urlencoded`,
                        'Connection': `keep-alive`,
                        'Accept-Encoding': `gzip,compress,br,deflate`,
                        'Referer': `https://servicewechat.com/wxa5bf5ee667d91626/161/page-frame.html`,
                        'Host': `wxapp.m.jd.com`,
                        'User-Agent': `Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.10(0x18000a2a) NetType/WIFI Language/zh_CN`,
                    },
                    timeout: 10000,
                };
                $.post(options, (err, resp, data) => {
                    try {
                        if (err) {
                            $.logErr(err);
                        } else {
                            if (data) {
                                data = JSON.parse(data);

                                if (!data.user) {
                                    return;
                                }
                                const userInfo = data.user;
                                if (userInfo) {
                                    if (!$.nickName) $.nickName = userInfo.petName;
                                    if ($.beanCount == 0) {
                                        $.beanCount = userInfo.jingBean;
                                    }
                                    $.JingXiang = userInfo.uclass;
                                }
                            } else {
                                $.log('京东服务器返回空数据');
                            }
                        }
                    } catch (e) {
                        $.logErr(e);
                    } finally {
                        resolve();
                    }
                });
            });
        }

        function isLoginByX1a0He() {
            return new Promise(resolve => {
                const options = {
                    url: 'https://plogin.m.jd.com/cgi-bin/ml/islogin',
                    headers: {
                        'Cookie': cookie,
                        'referer': 'https://h5.m.jd.com/',
                        'User-Agent':
                            'jdapp;iPhone;10.1.2;15.0;network/wifi;Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1',
                    },
                    timeout: 10000,
                };
                $.get(options, (err, resp, data) => {
                    try {
                        if (data) {
                            data = JSON.parse(data);
                            if (data.islogin === '1') {
                                console.log(`使用X1a0He写的接口加强检测: Cookie有效\n`);
                            } else if (data.islogin === '0') {
                                $.isLogin = false;
                                console.log(`使用X1a0He写的接口加强检测: Cookie无效\n`);
                            } else {
                                console.log(`使用X1a0He写的接口加强检测: 未知返回，不作变更...\n`);
                                $.error = `${$.nickName} :` + `使用X1a0He写的接口加强检测: 未知返回...\n`;
                            }
                        }
                    } catch (e) {
                        console.log(e);
                    } finally {
                        resolve();
                    }
                });
            });
        }

        function getJingBeanBalanceDetail(page) {
            return new Promise(async resolve => {
                const options = {
                    url: `https://bean.m.jd.com/beanDetail/detail.json?page=${page}`,
                    body: `body=${escape(
                        JSON.stringify({ pageSize: '20', page: page.toString() })
                    )}&appid=ld`,
                    headers: {
                        'User-Agent': UA.USER_AGENT(),
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Cookie': cookie,
                    },
                };
                $.post(options, (err, resp, data) => {
                    try {
                        if (err) {
                            // console.log(`${JSON.stringify(err)}`)
                            // console.log(`${$.name} API请求失败，请检查网路重试`)
                        } else {
                            if (data) {
                                data = JSON.parse(data);
                                // console.log(data)
                            } else {
                                // console.log(`京东服务器返回空数据`)
                            }
                        }
                    } catch (e) {
                        // $.logErr(e, resp)
                    } finally {
                        resolve(data);
                    }
                });
            });
        }

        function queryexpirejingdou() {
            return new Promise(async resolve => {
                const options = {
                    url: `https://wq.jd.com/activep3/singjd/queryexpirejingdou?_=${Date.now()}&g_login_type=1&sceneval=2`,
                    headers: {
                        'Accept': '*/*',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Accept-Language': 'zh-cn',
                        'Connection': 'keep-alive',
                        'Cookie': cookie,
                        'Host': 'wq.jd.com',
                        'Referer': 'https://wqs.jd.com/promote/201801/bean/mybean.html',
                        'User-Agent':
                            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.1 Mobile/15E148 Safari/604.1',
                    },
                };
                $.get(options, (err, resp, data) => {
                    try {
                        if (err) {
                            console.log(`${JSON.stringify(err)}`);
                            console.log(`queryexpirejingdou API请求失败，请检查网路重试`);
                        } else {
                            if (data) {
                                // console.log(data)
                                data = JSON.parse(data.slice(23, -13));
                                if (data.ret === 0) {
                                    data['expirejingdou'].map(item => {
                                        if (item['expireamount'] != 0) {
                                            strGuoqi += `【${timeFormat(item['time'] * 1000)}】过期${
                                                item['expireamount']
                                            }豆\n`;
                                            if (decExBean == 0) decExBean = item['expireamount'];
                                        }
                                    });
                                }
                            } else {
                                console.log(`京东服务器返回空数据`);
                            }
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve();
                    }
                });
            });
        }
        function exchangejxbeans(o) {
            return new Promise(async resolve => {
                var UUID = getUUID('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
                var JXUA = `jdpingou;iPhone;4.13.0;14.4.2;${UUID};network/wifi;model/iPhone10,2;appBuild/100609;ADID/00000000-0000-0000-0000-000000000000;supportApplePay/1;hasUPPay/0;pushNoticeIsOpen/1;hasOCPay/0;supportBestPay/0;session/${
                    Math.random * 98 + 1
                };pap/JA2019_3111789;brand/apple;supportJDSHWK/1;Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148`;
                const options = {
                    url: `https://m.jingxi.com/deal/masset/jd2xd?use=${o}&canpintuan=&setdefcoupon=0&r=${Math.random()}&sceneval=2`,
                    headers: {
                        'Host': 'm.jingxi.com',
                        'Accept': '*/*',
                        'Cookie': cookie,
                        'Connection': 'keep-alive',
                        'User-Agent': JXUA,
                        'Accept-Language': 'zh-cn',
                        'Referer': 'https://m.jingxi.com/deal/confirmorder/main',
                        'Accept-Encoding': 'gzip, deflate, br',
                    },
                };
                $.get(options, (err, resp, data) => {
                    try {
                        if (err) {
                            console.log(err);
                        } else {
                            data = JSON.parse(data);
                            if (data && data.data && JSON.stringify(data.data) === '{}') {
                                console.log(JSON.stringify(data));
                            }
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve(data || {});
                    }
                });
            });
        }
        function getUUID(x = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', t = 0) {
            return x.replace(/[xy]/g, function (x) {
                var r = (16 * Math.random()) | 0,
                    n = 'x' == x ? r : (3 & r) | 8;
                return (uuid = t ? n.toString(36).toUpperCase() : n.toString(36)), uuid;
            });
        }

        function redPacket() {
            return new Promise(async resolve => {
                const options = {
                    url: `https://api.m.jd.com/client.action?functionId=myhongbao_getUsableHongBaoList&body=%7B%22appId%22%3A%22appHongBao%22%2C%22appToken%22%3A%22apphongbao_token%22%2C%22platformId%22%3A%22appHongBao%22%2C%22platformToken%22%3A%22apphongbao_token%22%2C%22platform%22%3A%221%22%2C%22orgType%22%3A%222%22%2C%22country%22%3A%22cn%22%2C%22childActivityId%22%3A%22-1%22%2C%22childActiveName%22%3A%22-1%22%2C%22childActivityTime%22%3A%22-1%22%2C%22childActivityUrl%22%3A%22-1%22%2C%22openId%22%3A%22-1%22%2C%22activityArea%22%3A%22-1%22%2C%22applicantErp%22%3A%22-1%22%2C%22eid%22%3A%22-1%22%2C%22fp%22%3A%22-1%22%2C%22shshshfp%22%3A%22-1%22%2C%22shshshfpa%22%3A%22-1%22%2C%22shshshfpb%22%3A%22-1%22%2C%22jda%22%3A%22-1%22%2C%22activityType%22%3A%221%22%2C%22isRvc%22%3A%22-1%22%2C%22pageClickKey%22%3A%22-1%22%2C%22extend%22%3A%22-1%22%2C%22organization%22%3A%22JD%22%7D&appid=JDReactMyRedEnvelope&client=apple&clientVersion=7.0.0`,
                    headers: {
                        'Host': 'api.m.jd.com',
                        'Accept': '*/*',
                        'Connection': 'keep-alive',
                        'Accept-Language': 'zh-cn',
                        'Referer': 'https://h5.m.jd.com/',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Cookie': cookie,
                        'User-Agent': UA.USER_AGENT(),
                    },
                };
                $.get(options, (err, resp, data) => {
                    try {
                        if (err) {
                            console.log(`${JSON.stringify(err)}`);
                            console.log(`redPacket API请求失败，请检查网路重试`);
                        } else {
                            if (data) {
                                data = JSON.parse(data);
                                // console.log('data', data);
                                $.jxRed = 0;
                                $.jsRed = 0;
                                $.jdRed = 0;
                                $.jdhRed = 0;
                                $.jdwxRed = 0;
                                $.jdGeneralRed = 0;
                                $.jxRedExpire = 0;
                                $.jsRedExpire = 0;
                                ($.jdRedExpire = 0), ($.jdhRedExpire = 0);
                                ($.jdwxRedExpire = 0), ($.jdGeneralRedExpire = 0);

                                let t = new Date();
                                t.setDate(t.getDate() + 1);
                                t.setHours(0, 0, 0, 0);
                                t = parseInt((t - 1) / 1000) * 1000;
                                //console.log(JSON.stringify(data.useRedInfo.redList))
                                for (let vo of data.hongBaoList || []) {
                                    if (vo.orgLimitStr) {
                                        if (
                                            vo.orgLimitStr.includes('京喜') &&
                                            !vo.orgLimitStr.includes('特价')
                                        ) {
                                            $.jxRed += parseFloat(vo.balance);
                                            if (vo['endTime'] === t) {
                                                $.jxRedExpire += parseFloat(vo.balance);
                                            }
                                            continue;
                                        } else if (vo.orgLimitStr.includes('购物小程序')) {
                                            $.jdwxRed += parseFloat(vo.balance);

                                            if (vo['endTime'] === t) {
                                                $.jdwxRedExpire += parseFloat(vo.balance);
                                            }
                                            continue;
                                        } else if (vo.orgLimitStr.includes('京东商城')) {
                                            $.jdRed += parseFloat(vo.balance);
                                            // console.log(`vo['endTime']`, vo['endTime']);
                                            // console.log(`t`, t);
                                            if (vo['endTime'] === t) {
                                                $.jdRedExpire += parseFloat(vo.balance);
                                            }
                                            continue;
                                        } else if (
                                            vo.orgLimitStr.includes('极速') ||
                                            vo.orgLimitStr.includes('京东特价') ||
                                            vo.orgLimitStr.includes('京喜特价')
                                        ) {
                                            $.jsRed += parseFloat(vo.balance);
                                            if (vo['endTime'] === t) {
                                                $.jsRedExpire += parseFloat(vo.balance);
                                            }
                                            continue;
                                        } else if (vo.orgLimitStr && vo.orgLimitStr.includes('京东健康')) {
                                            $.jdhRed += parseFloat(vo.balance);
                                            if (vo['endTime'] === t) {
                                                $.jdhRedExpire += parseFloat(vo.balance);
                                            }
                                            continue;
                                        }
                                    }

                                    $.jdGeneralRed += parseFloat(vo.balance);
                                    if (vo['endTime'] === t) {
                                        $.jdGeneralRedExpire += parseFloat(vo.balance);
                                    }
                                }
                                // console.log('$.message', $.message);
                                // console.log('jdRedExpire', $.jdRedExpire);

                                $.balance = (
                                    $.jxRed +
                                    $.jsRed +
                                    $.jdRed +
                                    $.jdhRed +
                                    $.jdwxRed +
                                    $.jdGeneralRed
                                ).toFixed(2);
                                $.jxRed = $.jxRed.toFixed(2);
                                $.jsRed = $.jsRed.toFixed(2);
                                $.jdRed = $.jdRed.toFixed(2);
                                $.jdhRed = $.jdhRed.toFixed(2);
                                $.jdwxRed = $.jdwxRed.toFixed(2);
                                $.jdGeneralRed = $.jdGeneralRed.toFixed(2);
                                $.expiredBalance = (
                                    $.jxRedExpire +
                                    $.jsRedExpire +
                                    $.jdRedExpire +
                                    $.jdhRedExpire +
                                    $.jdwxRedExpire +
                                    $.jdGeneralRedExpire
                                ).toFixed(2);
                                $.message += `【红包总额】${$.balance}(总过期${$.expiredBalance})元 \n`;
                                if ($.jxRed > 0) {
                                    if ($.jxRedExpire > 0)
                                        $.message += `【京喜红包】${$.jxRed}(将过期${$.jxRedExpire.toFixed(
                                            2
                                        )})元 \n`;
                                    else $.message += `【京喜红包】${$.jxRed}元 \n`;
                                }

                                if ($.jsRed > 0) {
                                    if ($.jsRedExpire > 0)
                                        $.message += `【京喜特价】${$.jsRed}(将过期${$.jsRedExpire.toFixed(
                                            2
                                        )})元(原极速版) \n`;
                                    else $.message += `【京喜特价】${$.jsRed}元(原极速版) \n`;
                                }

                                if ($.jdRed > 0) {
                                    if ($.jdRedExpire > 0)
                                        $.message += `【京东红包】${$.jdRed}(将过期${$.jdRedExpire.toFixed(
                                            2
                                        )})元 \n`;
                                    else $.message += `【京东红包】${$.jdRed}元 \n`;
                                }

                                if ($.jdhRed > 0) {
                                    if ($.jdhRedExpire > 0)
                                        $.message += `【健康红包】${$.jdhRed}(将过期${$.jdhRedExpire.toFixed(
                                            2
                                        )})元 \n`;
                                    else $.message += `【健康红包】${$.jdhRed}元 \n`;
                                }

                                if ($.jdwxRed > 0) {
                                    if ($.jdwxRedExpire > 0)
                                        $.message += `【微信小程序】${
                                            $.jdwxRed
                                        }(将过期${$.jdwxRedExpire.toFixed(2)})元 \n`;
                                    else $.message += `【微信小程序】${$.jdwxRed}元 \n`;
                                }

                                if ($.jdGeneralRed > 0) {
                                    if ($.jdGeneralRedExpire > 0)
                                        $.message += `【全平台通用】${
                                            $.jdGeneralRed
                                        }(将过期${$.jdGeneralRedExpire.toFixed(2)})元 \n`;
                                    else $.message += `【全平台通用】${$.jdGeneralRed}元 \n`;
                                }
                            } else {
                                console.log(`京东服务器返回空数据`);
                            }
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve(data);
                    }
                });
            });
        }

        function getCoupon() {
            return new Promise(resolve => {
                let options = {
                    url: `https://wq.jd.com/activeapi/queryjdcouponlistwithfinance?state=1&wxadd=1&filterswitch=1&_=${Date.now()}&sceneval=2&g_login_type=1&callback=jsonpCBKB&g_ty=ls`,
                    headers: {
                        'authority': 'wq.jd.com',
                        'User-Agent':
                            'jdapp;iPhone;10.1.2;15.0;network/wifi;Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1',
                        'accept': '*/*',
                        'referer': 'https://wqs.jd.com/',
                        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
                        'cookie': cookie,
                    },
                    timeout: 10000,
                };
                $.get(options, async (err, resp, data) => {
                    try {
                        data = JSON.parse(data.match(new RegExp(/jsonpCBK.?\((.*);*/))[1]);
                        let couponTitle = '';
                        let couponId = '';
                        // 删除可使用且非超市、生鲜、京贴;
                        let useable = data.coupon.useable;
                        $.todayEndTime = new Date(
                            new Date(new Date().getTime()).setHours(23, 59, 59, 999)
                        ).getTime();
                        $.tomorrowEndTime = new Date(
                            new Date(new Date().getTime() + 24 * 60 * 60 * 1000).setHours(23, 59, 59, 999)
                        ).getTime();
                        $.platFormInfo = '';
                        for (let i = 0; i < useable.length; i++) {
                            //console.log(useable[i]);
                            if (useable[i].limitStr.indexOf('全品类') > -1) {
                                $.beginTime = useable[i].beginTime;
                                if (
                                    $.beginTime < new Date().getTime() &&
                                    useable[i].quota <= 100 &&
                                    useable[i].coupontype === 1
                                ) {
                                    //$.couponEndTime = new Date(parseInt(useable[i].endTime)).Format('yyyy-MM-dd');
                                    $.couponName = useable[i].limitStr;
                                    if (useable[i].platFormInfo) $.platFormInfo = useable[i].platFormInfo;

                                    var decquota = parseFloat(useable[i].quota).toFixed(2);
                                    var decdisc = parseFloat(useable[i].discount).toFixed(2);

                                    $.message += `【全品类券】满${decquota}减${decdisc}元`;

                                    if (useable[i].endTime < $.todayEndTime) {
                                        $.message += `(今日过期,${$.platFormInfo})\n`;
                                    } else if (useable[i].endTime < $.tomorrowEndTime) {
                                        $.message += `(明日将过期,${$.platFormInfo})\n`;
                                    } else {
                                        $.message += `(${$.platFormInfo})\n`;
                                    }
                                }
                            }
                            if (
                                useable[i].couponTitle.indexOf('运费券') > -1 &&
                                useable[i].limitStr.indexOf('自营商品运费') > -1
                            ) {
                                if (!$.YunFeiTitle) {
                                    $.YunFeiTitle = useable[i].couponTitle;
                                    $.YunFeiQuanEndTime = new Date(parseInt(useable[i].endTime)).Format(
                                        'yyyy-MM-dd'
                                    );
                                    $.YunFeiQuan += 1;
                                } else {
                                    if ($.YunFeiTitle == useable[i].couponTitle) {
                                        $.YunFeiQuanEndTime = new Date(parseInt(useable[i].endTime)).Format(
                                            'yyyy-MM-dd'
                                        );
                                        $.YunFeiQuan += 1;
                                    } else {
                                        if (!$.YunFeiTitle2) $.YunFeiTitle2 = useable[i].couponTitle;

                                        if ($.YunFeiTitle2 == useable[i].couponTitle) {
                                            $.YunFeiQuanEndTime2 = new Date(
                                                parseInt(useable[i].endTime)
                                            ).Format('yyyy-MM-dd');
                                            $.YunFeiQuan2 += 1;
                                        }
                                    }
                                }
                            }
                            if (
                                useable[i].couponTitle.indexOf('特价版APP活动') > -1 &&
                                useable[i].limitStr == '仅可购买活动商品'
                            ) {
                                $.beginTime = useable[i].beginTime;
                                if ($.beginTime < new Date().getTime() && useable[i].coupontype === 1) {
                                    if (useable[i].platFormInfo) $.platFormInfo = useable[i].platFormInfo;
                                    var decquota = parseFloat(useable[i].quota).toFixed(2);
                                    var decdisc = parseFloat(useable[i].discount).toFixed(2);

                                    $.message += `【特价版券】满${decquota}减${decdisc}元`;

                                    if (useable[i].endTime < $.todayEndTime) {
                                        $.message += `(今日过期,${$.platFormInfo})\n`;
                                    } else if (useable[i].endTime < $.tomorrowEndTime) {
                                        $.message += `(明日将过期,${$.platFormInfo})\n`;
                                    } else {
                                        $.message += `(${$.platFormInfo})\n`;
                                    }
                                }
                            }
                            //8是支付券， 7是白条券
                            if (useable[i].couponStyle == 7 || useable[i].couponStyle == 8) {
                                $.beginTime = useable[i].beginTime;
                                if (
                                    $.beginTime > new Date().getTime() ||
                                    useable[i].quota > 50 ||
                                    useable[i].coupontype != 1
                                ) {
                                    continue;
                                }

                                if (useable[i].couponStyle == 8) {
                                    $.couponType = '支付立减';
                                } else {
                                    $.couponType = '白条优惠';
                                }
                                if (useable[i].discount < useable[i].quota)
                                    $.message += `【${$.couponType}】满${useable[i].quota}减${useable[i].discount}元`;
                                else $.message += `【${$.couponType}】立减${useable[i].discount}元`;
                                if (useable[i].platFormInfo) $.platFormInfo = useable[i].platFormInfo;

                                //$.couponEndTime = new Date(parseInt(useable[i].endTime)).Format('yyyy-MM-dd');

                                if (useable[i].endTime < $.todayEndTime) {
                                    $.message += `(今日过期,${$.platFormInfo})\n`;
                                } else if (useable[i].endTime < $.tomorrowEndTime) {
                                    $.message += `(明日将过期,${$.platFormInfo})\n`;
                                } else {
                                    $.message += `(${$.platFormInfo})\n`;
                                }
                            }
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve();
                    }
                });
            });
        }

        function getJdZZ() {
            if (!EnableJdZZ) return;
            return new Promise(resolve => {
                $.get(taskJDZZUrl('interactTaskIndex'), async (err, resp, data) => {
                    try {
                        if (err) {
                            console.log(`${JSON.stringify(err)}`);
                            console.log(`京东赚赚API请求失败，请检查网路重试`);
                        } else {
                            if (safeGet(data)) {
                                data = JSON.parse(data);
                                $.JdzzNum = data.data.totalNum;
                            }
                        }
                    } catch (e) {
                        //$.logErr(e, resp)
                        console.log(`京东赚赚数据获取失败`);
                    } finally {
                        resolve(data);
                    }
                });
            });
        }

        function taskJDZZUrl(functionId, body = {}) {
            return {
                url: `${JD_API_HOST}?functionId=${functionId}&body=${escape(
                    JSON.stringify(body)
                )}&client=wh5&clientVersion=9.1.0`,
                headers: {
                    'Cookie': cookie,
                    'Host': 'api.m.jd.com',
                    'Connection': 'keep-alive',
                    'Content-Type': 'application/json',
                    'Referer': 'http://wq.jd.com/wxapp/pages/hd-interaction/index/index',
                    'Accept-Language': 'zh-cn',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'User-Agent': UA.USER_AGENT(),
                },
                timeout: 10000,
            };
        }

        function jdfruitRequest(function_id, body = {}, timeout = 1000) {
            return new Promise(resolve => {
                setTimeout(() => {
                    $.get(taskfruitUrl(function_id, body), (err, resp, data) => {
                        try {
                            if (err) {
                                console.log('\n东东农场: API查询请求失败 ‼️‼️');
                                console.log(JSON.stringify(err));
                                console.log(`function_id:${function_id}`);
                                $.logErr(err);
                            } else {
                                if (safeGet(data)) {
                                    data = JSON.parse(data);
                                    if (data.code == '400') {
                                        console.log('东东农场: ' + data.message);
                                        llgeterror = true;
                                    } else $.JDwaterEveryDayT = data.totalWaterTaskInit.totalWaterTaskTimes;
                                }
                            }
                        } catch (e) {
                            $.logErr(e, resp);
                        } finally {
                            resolve(data);
                        }
                    });
                }, timeout);
            });
        }

        async function getjdfruitinfo() {
            if (EnableJdFruit) {
                llgeterror = false;

                await jdfruitRequest('taskInitForFarm', {
                    version: 14,
                    channel: 1,
                    babelChannel: '120',
                });

                if (llgeterror) return;

                await getjdfruit();
                if (llgeterror) {
                    console.log(`东东农场API查询失败,等待10秒后再次尝试...`);
                    await $.wait(10 * 1000);
                    await getjdfruit();
                }
                if (llgeterror) {
                    console.log(`东东农场API查询失败,有空重启路由器换个IP吧.`);
                }
            }
            return;
        }

        async function GetJxBeaninfo() {
            await GetJxBean(), await jxbean();
            return;
        }

        async function getjdfruit() {
            return new Promise(resolve => {
                const option = {
                    url: `${JD_API_HOST}?functionId=initForFarm`,
                    body: `body=${escape(JSON.stringify({ version: 4 }))}&appid=wh5&clientVersion=9.1.0`,
                    headers: {
                        'accept': '*/*',
                        'accept-encoding': 'gzip, deflate, br',
                        'accept-language': 'zh-CN,zh;q=0.9',
                        'cache-control': 'no-cache',
                        'cookie': cookie,
                        'origin': 'https://home.m.jd.com',
                        'pragma': 'no-cache',
                        'referer': 'https://home.m.jd.com/myJd/newhome.action',
                        'sec-fetch-dest': 'empty',
                        'sec-fetch-mode': 'cors',
                        'sec-fetch-site': 'same-site',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': UA.USER_AGENT(),
                    },
                    timeout: 10000,
                };
                $.post(option, (err, resp, data) => {
                    try {
                        if (err) {
                            if (!llgeterror) {
                                console.log('\n东东农场: API查询请求失败 ‼️‼️');
                                console.log(JSON.stringify(err));
                            }
                            llgeterror = true;
                        } else {
                            llgeterror = false;
                            if (safeGet(data)) {
                                $.farmInfo = JSON.parse(data);
                                if ($.farmInfo.farmUserPro) {
                                    $.JdFarmProdName = $.farmInfo.farmUserPro.name;
                                    $.JdtreeEnergy = $.farmInfo.farmUserPro.treeEnergy;
                                    $.JdtreeTotalEnergy = $.farmInfo.farmUserPro.treeTotalEnergy;
                                    $.treeState = $.farmInfo.treeState;
                                    let waterEveryDayT = $.JDwaterEveryDayT;
                                    let waterTotalT =
                                        ($.farmInfo.farmUserPro.treeTotalEnergy -
                                            $.farmInfo.farmUserPro.treeEnergy -
                                            $.farmInfo.farmUserPro.totalEnergy) /
                                        10; //一共还需浇多少次水
                                    let waterD = Math.ceil(waterTotalT / waterEveryDayT);

                                    $.JdwaterTotalT = waterTotalT;
                                    $.JdwaterD = waterD;
                                }
                            }
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve();
                    }
                });
            });
        }

        function taskfruitUrl(function_id, body = {}) {
            return {
                url: `${JD_API_HOST}?functionId=${function_id}&body=${encodeURIComponent(
                    JSON.stringify(body)
                )}&appid=wh5`,
                headers: {
                    'Host': 'api.m.jd.com',
                    'Accept': '*/*',
                    'Origin': 'https://carry.m.jd.com',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'User-Agent': UA.USER_AGENT(),
                    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
                    'Referer': 'https://carry.m.jd.com/',
                    'Cookie': cookie,
                },
                timeout: 10000,
            };
        }

        function safeGet(data) {
            try {
                if (typeof JSON.parse(data) == 'object') {
                    return true;
                }
            } catch (e) {
                console.log(e);
                console.log(`京东服务器访问数据为空，请检查自身设备网络情况`);
                return false;
            }
        }
        function cash() {
            if (!EnableJdSpeed) return;
            return new Promise(resolve => {
                $.get(
                    taskcashUrl('MyAssetsService.execute', {
                        method: 'userCashRecord',
                        data: {
                            channel: 1,
                            pageNum: 1,
                            pageSize: 20,
                        },
                    }),
                    async (err, resp, data) => {
                        try {
                            if (err) {
                                console.log(`${JSON.stringify(err)}`);
                                console.log(`cash API请求失败，请检查网路重试`);
                            } else {
                                if (safeGet(data)) {
                                    data = JSON.parse(data);
                                    if (data.data.goldBalance) $.JDtotalcash = data.data.goldBalance;
                                    else console.log(`领现金查询失败，服务器没有返回具体值.`);
                                }
                            }
                        } catch (e) {
                            $.logErr(e, resp);
                        } finally {
                            resolve(data);
                        }
                    }
                );
            });
        }
        function taskcashUrl(functionId, body = {}) {
            const struuid = randomString(16);
            let nowTime = Date.now();
            let _0x7683x5 = `${'lite-android&'}${JSON['stringify'](
                body
            )}${'&android&3.1.0&'}${functionId}&${nowTime}&${struuid}`;
            let _0x7683x6 = '12aea658f76e453faf803d15c40a72e0';
            const _0x7683x7 = $['isNode']() ? require('crypto-js') : CryptoJS;
            let sign = _0x7683x7.HmacSHA256(_0x7683x5, _0x7683x6).toString();
            let strurl =
                JD_API_HOST +
                'api?functionId=' +
                functionId +
                '&body=' +
                `${escape(JSON['stringify'](body))}&appid=lite-android&client=android&uuid=` +
                struuid +
                `&clientVersion=3.1.0&t=${nowTime}&sign=${sign}`;
            return {
                url: strurl,
                headers: {
                    'Host': 'api.m.jd.com',
                    'accept': '*/*',
                    'kernelplatform': 'RN',
                    'user-agent': 'JDMobileLite/3.1.0 (iPad; iOS 14.4; Scale/2.00)',
                    'accept-language': 'zh-Hans-CN;q=1, ja-CN;q=0.9',
                    'Cookie': cookie,
                },
                timeout: 10000,
            };
        }

        // 东东工厂信息查询
        async function getDdFactoryInfo() {
            if (!EnableJDGC) return;
            // 当心仪的商品存在，并且收集起来的电量满足当前商品所需，就投入
            let infoMsg = '';
            return new Promise(resolve => {
                $.post(ddFactoryTaskUrl('jdfactory_getHomeData'), async (err, resp, data) => {
                    try {
                        if (err) {
                            $.ddFactoryInfo = '获取失败!';
                            /*console.log(`${JSON.stringify(err)}`)
                            console.log(`${$.name} API请求失败，请检查网路重试`)*/
                        } else {
                            if (safeGet(data)) {
                                data = JSON.parse(data);
                                if (data.data.bizCode === 0) {
                                    // $.newUser = data.data.result.newUser;
                                    //let wantProduct = $.isNode() ? (process.env.FACTORAY_WANTPRODUCT_NAME ? process.env.FACTORAY_WANTPRODUCT_NAME : wantProduct) : ($.getdata('FACTORAY_WANTPRODUCT_NAME') ? $.getdata('FACTORAY_WANTPRODUCT_NAME') : wantProduct);
                                    if (data.data.result.factoryInfo) {
                                        let {
                                            totalScore,
                                            useScore,
                                            produceScore,
                                            remainScore,
                                            couponCount,
                                            name,
                                        } = data.data.result.factoryInfo;
                                        if (couponCount == 0) {
                                            infoMsg = `${name} 没货了,死了这条心吧!`;
                                        } else {
                                            infoMsg = `${name}(${(
                                                ((remainScore * 1 + useScore * 1) / (totalScore * 1)) *
                                                100
                                            ).toFixed(0)}%,剩${couponCount})`;
                                        }
                                        if (
                                            remainScore * 1 + useScore * 1 >= totalScore * 1 + 100000 &&
                                            couponCount * 1 > 0
                                        ) {
                                            // await jdfactory_addEnergy();
                                            infoMsg = `${name} 可以兑换了!`;
                                            $.DdFactoryReceive = `${name}`;
                                        }
                                    } else {
                                        infoMsg = ``;
                                    }
                                } else {
                                    $.ddFactoryInfo = '';
                                }
                            }
                        }
                        $.ddFactoryInfo = infoMsg;
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve();
                    }
                });
            });
        }

        function ddFactoryTaskUrl(function_id, body = {}, function_id2) {
            let url = `${JD_API_HOST}`;
            if (function_id2) {
                url += `?functionId=${function_id2}`;
            }
            return {
                url,
                body: `functionId=${function_id}&body=${escape(
                    JSON.stringify(body)
                )}&client=wh5&clientVersion=1.1.0`,
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Accept-Language': 'zh-cn',
                    'Connection': 'keep-alive',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Cookie': cookie,
                    'Host': 'api.m.jd.com',
                    'Origin': 'https://h5.m.jd.com',
                    'Referer': 'https://h5.m.jd.com/babelDiy/Zeus/2uSsV2wHEkySvompfjB43nuKkcHp/index.html',
                    'User-Agent':
                        'jdapp;iPhone;9.3.4;14.3;88732f840b77821b345bf07fd71f609e6ff12f43;network/4g;ADID/1C141FDD-C62F-425B-8033-9AAB7E4AE6A3;supportApplePay/0;hasUPPay/0;hasOCPay/0;model/iPhone11,8;addressid/2005183373;supportBestPay/0;appBuild/167502;jdSupportDarkMode/0;pv/414.19;apprpd/Babel_Native;ref/TTTChannelViewContoller;psq/5;ads/;psn/88732f840b77821b345bf07fd71f609e6ff12f43|1701;jdv/0|iosapp|t_335139774|appshare|CopyURL|1610885480412|1610885486;adk/;app_device/IOS;pap/JA2015_311210|9.3.4|IOS 14.3;Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1',
                },
                timeout: 10000,
            };
        }

        async function getJoyBaseInfo(taskId = '', inviteType = '', inviterPin = '') {
            if (!EnableJoyPark) return;
            return new Promise(resolve => {
                $.post(
                    taskPostClientActionUrl(
                        `body={"taskId":"${taskId}","inviteType":"${inviteType}","inviterPin":"${inviterPin}","linkId":"LsQNxL7iWDlXUs6cFl-AAg"}&appid=activities_platform`
                    ),
                    async (err, resp, data) => {
                        try {
                            if (err) {
                                console.log(`${JSON.stringify(err)}`);
                                console.log(`汪汪乐园 API请求失败，请检查网路重试`);
                            } else {
                                data = JSON.parse(data);
                                if (data.success) {
                                    $.joylevel = data.data.level;
                                }
                            }
                        } catch (e) {
                            $.logErr(e, resp);
                        } finally {
                            resolve();
                        }
                    }
                );
            });
        }
        function taskPostClientActionUrl(body) {
            return {
                url: `https://api.m.jd.com/client.action?functionId=joyBaseInfo`,
                body: body,
                headers: {
                    'User-Agent': $.user_agent,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Host': 'api.m.jd.com',
                    'Origin': 'https://joypark.jd.com',
                    'Referer':
                        'https://joypark.jd.com/?activityId=LsQNxL7iWDlXUs6cFl-AAg&lng=113.387899&lat=22.512678&sid=4d76080a9da10fbb31f5cd43396ed6cw&un_area=19_1657_52093_0',
                    'Cookie': cookie,
                },
                timeout: 10000,
            };
        }

        function taskJxUrl(functionId, body = '') {
            let url = ``;
            var UA = `jdpingou;iPhone;4.13.0;14.4.2;${randomString(
                40
            )};network/wifi;model/iPhone10,2;appBuild/100609;supportApplePay/1;hasUPPay/0;pushNoticeIsOpen/1;hasOCPay/0;supportBestPay/0;session/${
                Math.random * 98 + 1
            };pap/JA2019_3111789;brand/apple;supportJDSHWK/1;Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148`;

            if (body) {
                url = `https://m.jingxi.com/activeapi/${functionId}?${body}`;
                url += `&_=${Date.now() + 2}&sceneval=2&g_login_type=1&callback=jsonpCBK${String.fromCharCode(
                    Math.floor(Math.random() * 26) + 'A'.charCodeAt(0)
                )}&g_ty=ls`;
            } else {
                url = `https://m.jingxi.com/activeapi/${functionId}?_=${
                    Date.now() + 2
                }&sceneval=2&g_login_type=1&callback=jsonpCBK${String.fromCharCode(
                    Math.floor(Math.random() * 26) + 'A'.charCodeAt(0)
                )}&g_ty=ls`;
            }
            return {
                url,
                headers: {
                    'Host': 'm.jingxi.com',
                    'Accept': '*/*',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'User-Agent': UA,
                    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
                    'Referer': 'https://st.jingxi.com/',
                    'Cookie': cookie,
                },
                timeout: 10000,
            };
        }

        function GetJxBeanDetailData() {
            return new Promise(resolve => {
                $.get(taskJxUrl('queryuserjingdoudetail', 'pagesize=10&type=16'), async (err, resp, data) => {
                    try {
                        if (err) {
                            console.log(JSON.stringify(err));
                            console.log(`GetJxBeanDetailData请求失败，请检查网路重试`);
                        } else {
                            data = JSON.parse(data.match(new RegExp(/jsonpCBK.?\((.*);*/))[1]);
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve(data);
                    }
                });
            });
        }
        function GetJxBean() {
            if (!EnableJxBeans) return;
            return new Promise(resolve => {
                $.get(taskJxUrl('querybeanamount'), async (err, resp, data) => {
                    try {
                        if (err) {
                            console.log(JSON.stringify(err));
                            console.log(`GetJxBean请求失败，请检查网路重试`);
                        } else {
                            data = JSON.parse(data.match(new RegExp(/jsonpCBK.?\((.*);*/))[1]);
                            if (data) {
                                if (data.errcode == 0) {
                                    $.xibeanCount = data.data.xibean;
                                    if (!$.beanCount) {
                                        $.beanCount = data.data.jingbean;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve(data);
                    }
                });
            });
        }
        async function jxbean() {
            if (!EnableJxBeans) return;
            //前一天的0:0:0时间戳
            const tm =
                parseInt((Date.now() + 28800000) / 86400000) * 86400000 - 28800000 - 24 * 60 * 60 * 1000;
            // 今天0:0:0时间戳
            const tm1 = parseInt((Date.now() + 28800000) / 86400000) * 86400000 - 28800000;
            var JxYesterdayArr = [],
                JxTodayArr = [];
            var JxResponse = await GetJxBeanDetailData();
            if (JxResponse && JxResponse.ret == '0') {
                var Jxdetail = JxResponse.detail;
                if (Jxdetail && Jxdetail.length > 0) {
                    for (let item of Jxdetail) {
                        const date = item.createdate.replace(/-/g, '/') + '+08:00';
                        if (
                            new Date(date).getTime() >= tm1 &&
                            !item['visibleinfo'].includes('退还') &&
                            !item['visibleinfo'].includes('扣赠')
                        ) {
                            JxTodayArr.push(item);
                        } else if (
                            tm <= new Date(date).getTime() &&
                            new Date(date).getTime() < tm1 &&
                            !item['visibleinfo'].includes('退还') &&
                            !item['visibleinfo'].includes('扣赠')
                        ) {
                            //昨日的
                            JxYesterdayArr.push(item);
                        } else if (tm > new Date(date).getTime()) {
                            break;
                        }
                    }
                } else {
                    $.errorMsg = `数据异常`;
                    console.log(`${$.nickName}\n${$.errorMsg}`);
                }

                for (let item of JxYesterdayArr) {
                    if (Number(item.amount) > 0) {
                        $.inJxBean += Number(item.amount);
                    } else if (Number(item.amount) < 0) {
                        $.OutJxBean += Number(item.amount);
                    }
                }
                for (let item of JxTodayArr) {
                    if (Number(item.amount) > 0) {
                        $.todayinJxBean += Number(item.amount);
                    } else if (Number(item.amount) < 0) {
                        $.todayOutJxBean += Number(item.amount);
                    }
                }
                $.todayOutJxBean = -$.todayOutJxBean;
                $.OutJxBean = -$.OutJxBean;
            }
        }

        function GetJoyRuninginfo() {
            if (!EnableJoyRun) return;

            const headers = {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
                'Connection': 'keep-alive',
                'Content-Length': '376',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookie,
                'Host': 'api.m.jd.com',
                'Origin': 'https://h5platform.jd.com',
                'Referer': 'https://h5platform.jd.com/',
                'User-Agent': `jdpingou;iPhone;4.13.0;14.4.2;${randomString(
                    40
                )};network/wifi;model/iPhone10,2;appBuild/100609;ADID/00000000-0000-0000-0000-000000000000;supportApplePay/1;hasUPPay/0;pushNoticeIsOpen/1;hasOCPay/0;supportBestPay/0;session/${
                    Math.random * 98 + 1
                };pap/JA2019_3111789;brand/apple;supportJDSHWK/1;Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148`,
            };
            var DateToday = new Date();
            const body = {
                linkId: 'L-sOanK_5RJCz7I314FpnQ',
                isFromJoyPark: true,
                joyLinkId: 'LsQNxL7iWDlXUs6cFl-AAg',
            };
            const options = {
                url: `https://api.m.jd.com/?functionId=runningPageHome&body=${encodeURIComponent(
                    JSON.stringify(body)
                )}&t=${DateToday.getTime()}&appid=activities_platform&client=ios&clientVersion=3.9.2`,
                headers,
            };
            return new Promise(resolve => {
                $.get(options, (err, resp, data) => {
                    try {
                        if (err) {
                            console.log(`${JSON.stringify(err)}`);
                            console.log(`GetJoyRuninginfo API请求失败，请检查网路重试`);
                        } else {
                            if (data) {
                                //console.log(data);
                                data = JSON.parse(data);
                                if (data.data.runningHomeInfo.prizeValue) {
                                    $.JoyRunningAmount = data.data.runningHomeInfo.prizeValue * 1;
                                }
                            }
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve(data);
                    }
                });
            });
        }

        function randomString(e) {
            e = e || 32;
            let t = '0123456789abcdef',
                a = t.length,
                n = '';
            for (let i = 0; i < e; i++) n += t.charAt(Math.floor(Math.random() * a));
            return n;
        }

        function decrypt(time, stk, type, url) {
            $.appId = 10028;
            stk = stk || (url ? getJxmcUrlData(url, '_stk') : '');
            if (stk) {
                const timestamp = new Date(time).Format('yyyyMMddhhmmssSSS');
                let hash1 = '';
                if ($.fingerprint && $.Jxmctoken && $.enCryptMethodJD) {
                    hash1 = $.enCryptMethodJD(
                        $.Jxmctoken,
                        $.fingerprint.toString(),
                        timestamp.toString(),
                        $.appId.toString(),
                        $.CryptoJS
                    ).toString($.CryptoJS.enc.Hex);
                } else {
                    const random = '5gkjB6SpmC9s';
                    $.Jxmctoken = `tk01wcdf61cb3a8nYUtHcmhSUFFCfddDPRvKvYaMjHkxo6Aj7dhzO+GXGFa9nPXfcgT+mULoF1b1YIS1ghvSlbwhE0Xc`;
                    $.fingerprint = 5287160221454703;
                    const str = `${$.Jxmctoken}${$.fingerprint}${timestamp}${$.appId}${random}`;
                    hash1 = $.CryptoJS.SHA512(str, $.Jxmctoken).toString($.CryptoJS.enc.Hex);
                }
                let st = '';
                stk.split(',').map((item, index) => {
                    st += `${item}:${getJxmcUrlData(url, item)}${
                        index === stk.split(',').length - 1 ? '' : '&'
                    }`;
                });
                const hash2 = $.CryptoJS.HmacSHA256(st, hash1.toString()).toString($.CryptoJS.enc.Hex);
                return encodeURIComponent(
                    [
                        ''.concat(timestamp.toString()),
                        ''.concat($.fingerprint.toString()),
                        ''.concat($.appId.toString()),
                        ''.concat($.Jxmctoken),
                        ''.concat(hash2),
                    ].join(';')
                );
            } else {
                return '20210318144213808;8277529360925161;10001;tk01w952a1b73a8nU0luMGtBanZTHCgj0KFVwDa4n5pJ95T/5bxO/m54p4MtgVEwKNev1u/BUjrpWAUMZPW0Kz2RWP8v;86054c036fe3bf0991bd9a9da1a8d44dd130c6508602215e50bb1e385326779d';
            }
        }

        function generateFp() {
            let e = '0123456789';
            let a = 13;
            let i = '';
            for (; a--; ) i += e[(Math.random() * e.length) | 0];
            return (i + Date.now()).slice(0, 16);
        }

        function getJxmcUrlData(url, name) {
            if (typeof URL !== 'undefined') {
                let urls = new URL(url);
                let data = urls.searchParams.get(name);
                return data ? data : '';
            } else {
                const query = url.match(/\?.*/)[0].substring(1);
                const vars = query.split('&');
                for (let i = 0; i < vars.length; i++) {
                    const pair = vars[i].split('=');
                    if (pair[0] === name) {
                        return vars[i].substr(vars[i].indexOf('=') + 1);
                    }
                }
                return '';
            }
        }

        function jsonParse(str) {
            if (typeof str == 'string') {
                try {
                    return JSON.parse(str);
                } catch (e) {
                    console.log(e);
                    $.msg($.name, '', '请勿随意在BoxJs输入框修改内容\n建议通过脚本去获取cookie');
                    return [];
                }
            }
        }
        function timeFormat(time) {
            let date;
            if (time) {
                date = new Date(time);
            } else {
                date = new Date();
            }
            return (
                date.getFullYear() +
                '-' +
                (date.getMonth() + 1 >= 10 ? date.getMonth() + 1 : '0' + (date.getMonth() + 1)) +
                '-' +
                (date.getDate() >= 10 ? date.getDate() : '0' + date.getDate())
            );
        }

        function GetPigPetInfo() {
            if (!EnablePigPet) return;
            return new Promise(async resolve => {
                const body = {
                    shareId: '',
                    source: 2,
                    channelLV: 'juheye',
                    riskDeviceParam: '{}',
                };
                $.post(taskPetPigUrl('pigPetLogin', body), async (err, resp, data) => {
                    try {
                        if (err) {
                            console.log(`${JSON.stringify(err)}`);
                            console.log(`GetPigPetInfo API请求失败，请检查网路重试`);
                        } else {
                            if (data) {
                                data = JSON.parse(data);
                                if (
                                    data.resultData.resultData.wished &&
                                    data.resultData.resultData.wishAward
                                ) {
                                    $.PigPet = `${data.resultData.resultData.wishAward.name}`;
                                }
                            } else {
                                console.log(`GetPigPetInfo: 京东服务器返回空数据`);
                            }
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve();
                    }
                });
            });
        }

        function taskPetPigUrl(function_id, body) {
            var UA = `jdpingou;iPhone;4.13.0;14.4.2;${randomString(
                40
            )};network/wifi;model/iPhone10,2;appBuild/100609;supportApplePay/1;hasUPPay/0;pushNoticeIsOpen/1;hasOCPay/0;supportBestPay/0;session/${
                Math.random * 98 + 1
            };pap/JA2019_3111789;brand/apple;supportJDSHWK/1;Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148`;
            return {
                url: `https://ms.jr.jd.com/gw/generic/uc/h5/m/${function_id}?_=${Date.now()}`,
                body: `reqData=${encodeURIComponent(JSON.stringify(body))}`,
                headers: {
                    'Accept': `*/*`,
                    'Origin': `https://u.jr.jd.com`,
                    'Accept-Encoding': `gzip, deflate, br`,
                    'Cookie': cookie,
                    'Content-Type': `application/x-www-form-urlencoded;charset=UTF-8`,
                    'Host': `ms.jr.jd.com`,
                    'Connection': `keep-alive`,
                    'User-Agent': UA,
                    'Referer': `https://u.jr.jd.com/`,
                    'Accept-Language': `zh-cn`,
                },
                timeout: 10000,
            };
        }

        function GetDateTime(date) {
            var timeString = '';

            var timeString = date.getFullYear() + '-';
            if (date.getMonth() + 1 < 10) timeString += '0' + (date.getMonth() + 1) + '-';
            else timeString += date.getMonth() + 1 + '-';

            if (date.getDate() < 10) timeString += '0' + date.getDate() + ' ';
            else timeString += date.getDate() + ' ';

            if (date.getHours() < 10) timeString += '0' + date.getHours() + ':';
            else timeString += date.getHours() + ':';

            if (date.getMinutes() < 10) timeString += '0' + date.getMinutes() + ':';
            else timeString += date.getMinutes() + ':';

            if (date.getSeconds() < 10) timeString += '0' + date.getSeconds();
            else timeString += date.getSeconds();

            return timeString;
        }

        async function queryScores() {
            if (!$.isPlusVip) return;
            let res = '';
            let url = {
                url: `https://rsp.jd.com/windControl/queryScore/v1?lt=m&an=plus.mobile&stamp=${Date.now()}`,
                headers: {
                    'Cookie': cookie,
                    'User-Agent':
                        'Mozilla/5.0 (Linux; Android 10; Redmi Note 8 Pro Build/QP1A.190711.020; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/77.0.3865.120 MQQBrowser/6.2 TBS/045715 Mobile Safari/537.36',
                    'Referer': 'https://plus.m.jd.com/rights/windControl',
                },
            };

            $.get(url, async (err, resp, data) => {
                try {
                    const result = JSON.parse(data);
                    if (result.code == 1000) {
                        $.PlustotalScore = result.rs.userSynthesizeScore.totalScore;
                    }
                } catch (e) {
                    $.logErr(e, resp);
                }
            });
        }

        async function getuserinfo() {
            let str = '$cooMrdGatewayUid$';
            var body = [{ pin: str }];
            var ua = `jdapp;iPhone;${random(['11.1.0', '10.5.0', '10.3.6'])};${random([
                '13.5',
                '14.0',
                '15.0',
            ])};${uuidRandom()};network/wifi;supportApplePay/0;hasUPPay/0;hasOCPay/0;model/iPhone11,6;addressid/7565095847;supportBestPay/0;appBuild/167541;jdSupportDarkMode/0;Mozilla/5.0 (iPhone; CPU iPhone OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148;supportJDSHWK/1`;

            let config = {
                url: 'https://lop-proxy.jd.com/JingIntegralApi/userAccount',
                body: JSON.stringify(body),
                headers: {
                    'host': 'lop-proxy.jd.com',
                    'jexpress-report-time': Date.now().toString(),
                    'access': 'H5',
                    'source-client': '2',
                    'accept': 'application/json, text/plain, */*',
                    'd_model': 'iPhone11,6',
                    'accept-encoding': 'gzip',
                    'lop-dn': 'jingcai.jd.com',
                    'user-agent': ua,
                    'partner': '',
                    'screen': '375*812',
                    'cookie': cookie,
                    'x-requested-with': 'XMLHttpRequest',
                    'version': '1.0.0',
                    'uuid': randomNumber(10),
                    'clientinfo': '{"appName":"jingcai","client":"m"}',
                    'd_brand': 'iPhone',
                    'appparams': '{"appid":158,"ticket_type":"m"}',
                    'sdkversion': '1.0.7',
                    'area': area(),
                    'client': 'iOS',
                    'referer': 'https://jingcai-h5.jd.com/',
                    'eid': '',
                    'osversion': random(['13.5', '14.0', '15.0']),
                    'networktype': 'wifi',
                    'jexpress-trace-id': uuid(),
                    'origin': 'https://jingcai-h5.jd.com',
                    'app-key': 'jexpress',
                    'event-id': uuid(),
                    'clientversion': random(['11.1.0', '10.5.0', '10.3.6']),
                    'content-type': 'application/json;charset=utf-8',
                    'build': '167541',
                    'biz-type': 'service-monitor',
                    'forcebot': '0',
                },
            };
            return new Promise(resolve => {
                $.post(config, async (err, resp, data) => {
                    try {
                        //console.log(data)
                        if (err) {
                            console.log(err);
                        } else {
                            data = JSON.parse(data);
                        }
                    } catch (e) {
                        $.logErr(e, resp);
                    } finally {
                        resolve(data || '');
                    }
                });
            });
        }
        function area() {
            let i = getRand(1, 30);
            let o = getRand(70, 3000);
            let x = getRand(900, 60000);
            let g = getRand(600, 30000);
            let a = i + '_' + o + '_' + x + '_' + g;
            return a;
        }
        function getRand(min, max) {
            return parseInt(Math.random() * (max - min)) + min;
        }
        function uuid() {
            var s = [];
            var hexDigits = '0123456789abcdef';
            for (var i = 0; i < 36; i++) {
                s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
            }
            s[14] = '4';
            s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1);
            s[8] = s[13] = s[18] = s[23] = '-';
            var uuid = s.join('');
            return uuid;
        }
        function uuidRandom() {
            return (
                Math.random().toString(16).slice(2, 10) +
                Math.random().toString(16).slice(2, 10) +
                Math.random().toString(16).slice(2, 10) +
                Math.random().toString(16).slice(2, 10) +
                Math.random().toString(16).slice(2, 10)
            );
        }
        function random(arr) {
            return arr[Math.floor(Math.random() * arr.length)];
        }
        function randomNumber(len) {
            let chars = '0123456789';
            let maxPos = chars.length;
            let str = '';
            for (let i = 0; i < len; i++) {
                str += chars.charAt(Math.floor(Math.random() * maxPos));
            }
            return Date.now() + str;
        }
        // prettier-ignore
        function Env(t, e) {
            "undefined" != typeof process && JSON.stringify(process.env).indexOf("GITHUB") > -1 && process.exit(0);
            class s {
                constructor(t) {
                    this.env = t;
                }
                send(t, e = "GET") {
                    t = "string" == typeof t ? {
                        url: t
                    }
                        : t;
                    let s = this.get;
                    return "POST" === e && (s = this.post),
                        new Promise((e, i) => {
                            s.call(this, t, (t, s, r) => {
                                t ? i(t) : e(s);
                            });
                        });
                }
                get(t) {
                    return this.send.call(this.env, t);
                }
                post(t) {
                    return this.send.call(this.env, t, "POST");
                }
            }
            return new class {
                constructor(t, e) {
                    this.name = t,
                        this.http = new s(this),
                        this.data = null,
                        this.dataFile = "box.dat",
                        this.logs = [],
                        this.isMute = !1,
                        this.isNeedRewrite = !1,
                        this.logSeparator = "\n",
                        this.startTime = (new Date).getTime(),
                        Object.assign(this, e);
                    // this.log("", `🔔${this.name}, 开始!`);
                }
                isNode() {
                    return "undefined" != typeof module && !!module.exports;
                }
                isQuanX() {
                    return "undefined" != typeof $task;
                }
                isSurge() {
                    return "undefined" != typeof $httpClient && "undefined" == typeof $loon;
                }
                isLoon() {
                    return "undefined" != typeof $loon;
                }
                toObj(t, e = null) {
                    try {
                        return JSON.parse(t);
                    } catch {
                        return e;
                    }
                }
                toStr(t, e = null) {
                    try {
                        return JSON.stringify(t);
                    } catch {
                        return e;
                    }
                }
                getjson(t, e) {
                    let s = e;
                    const i = this.getdata(t);
                    if (i)
                        try {
                            s = JSON.parse(this.getdata(t));
                        } catch { }
                    return s;
                }
                setjson(t, e) {
                    try {
                        return this.setdata(JSON.stringify(t), e);
                    } catch {
                        return !1;
                    }
                }
                getScript(t) {
                    return new Promise(e => {
                        this.get({
                            url: t
                        }, (t, s, i) => e(i));
                    });
                }
                runScript(t, e) {
                    return new Promise(s => {
                        let i = this.getdata("@chavy_boxjs_userCfgs.httpapi");
                        i = i ? i.replace(/\n/g, "").trim() : i;
                        let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");
                        r = r ? 1 * r : 20,
                            r = e && e.timeout ? e.timeout : r;
                        const [o, h] = i.split("@"),
                            n = {
                                url: `http://${h}/v1/scripting/evaluate`,
                                body: {
                                    script_text: t,
                                    mock_type: "cron",
                                    timeout: r
                                },
                                headers: {
                                    "X-Key": o,
                                    Accept: "*/*"
                                }
                            };
                        this.post(n, (t, e, i) => s(i));
                    }).catch(t => this.logErr(t));
                }
                loaddata() {
                    if (!this.isNode())
                        return {}; {
                        this.fs = this.fs ? this.fs : require("fs"),
                            this.path = this.path ? this.path : require("path");
                        const t = this.path.resolve(this.dataFile),
                            e = this.path.resolve(process.cwd(), this.dataFile),
                            s = this.fs.existsSync(t),
                            i = !s && this.fs.existsSync(e);
                        if (!s && !i)
                            return {}; {
                            const i = s ? t : e;
                            try {
                                return JSON.parse(this.fs.readFileSync(i));
                            } catch (t) {
                                return {};
                            }
                        }
                    }
                }
                writedata() {
                    if (this.isNode()) {
                        this.fs = this.fs ? this.fs : require("fs"),
                            this.path = this.path ? this.path : require("path");
                        const t = this.path.resolve(this.dataFile),
                            e = this.path.resolve(process.cwd(), this.dataFile),
                            s = this.fs.existsSync(t),
                            i = !s && this.fs.existsSync(e),
                            r = JSON.stringify(this.data);
                        s ? this.fs.writeFileSync(t, r) : i ? this.fs.writeFileSync(e, r) : this.fs.writeFileSync(t, r);
                    }
                }
                lodash_get(t, e, s) {
                    const i = e.replace(/\[(\d+)\]/g, ".$1").split(".");
                    let r = t;
                    for (const t of i)
                        if (r = Object(r)[t], void 0 === r)
                            return s;
                    return r;
                }
                lodash_set(t, e, s) {
                    return Object(t) !== t ? t : (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}, t)[e[e.length - 1]] = s, t);
                }
                getdata(t) {
                    let e = this.getval(t);
                    if (/^@/.test(t)) {
                        const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t),
                            r = s ? this.getval(s) : "";
                        if (r)
                            try {
                                const t = JSON.parse(r);
                                e = t ? this.lodash_get(t, i, "") : e;
                            } catch (t) {
                                e = "";
                            }
                    }
                    return e;
                }
                setdata(t, e) {
                    let s = !1;
                    if (/^@/.test(e)) {
                        const [, i, r] = /^@(.*?)\.(.*?)$/.exec(e),
                            o = this.getval(i),
                            h = i ? "null" === o ? null : o || "{}" : "{}";
                        try {
                            const e = JSON.parse(h);
                            this.lodash_set(e, r, t),
                                s = this.setval(JSON.stringify(e), i);
                        } catch (e) {
                            const o = {};
                            this.lodash_set(o, r, t),
                                s = this.setval(JSON.stringify(o), i);
                        }
                    } else
                        s = this.setval(t, e);
                    return s;
                }
                getval(t) {
                    return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.isNode() ? (this.data = this.loaddata(), this.data[t]) : this.data && this.data[t] || null;
                }
                setval(t, e) {
                    return this.isSurge() || this.isLoon() ? $persistentStore.write(t, e) : this.isQuanX() ? $prefs.setValueForKey(t, e) : this.isNode() ? (this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0) : this.data && this.data[e] || null;
                }
                initGotEnv(t) {
                    this.got = this.got ? this.got : require("got"),
                        this.cktough = this.cktough ? this.cktough : require("tough-cookie"),
                        this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar,
                        t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar));
                }
                get(t, e = (() => { })) {
                    t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"]),
                        this.isSurge() || this.isLoon() ? (this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, {
                            "X-Surge-Skip-Scripting": !1
                        })), $httpClient.get(t, (t, s, i) => {
                            !t && s && (s.body = i, s.statusCode = s.status),
                                e(t, s, i);
                        })) : this.isQuanX() ? (this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, {
                            hints: !1
                        })), $task.fetch(t).then(t => {
                            const {
                                statusCode: s,
                                statusCode: i,
                                headers: r,
                                body: o
                            } = t;
                            e(null, {
                                status: s,
                                statusCode: i,
                                headers: r,
                                body: o
                            }, o);
                        }, t => e(t))) : this.isNode() && (this.initGotEnv(t), this.got(t).on("redirect", (t, e) => {
                            try {
                                if (t.headers["set-cookie"]) {
                                    const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();
                                    s && this.ckjar.setCookieSync(s, null),
                                        e.cookieJar = this.ckjar;
                                }
                            } catch (t) {
                                this.logErr(t);
                            }
                        }).then(t => {
                            const {
                                statusCode: s,
                                statusCode: i,
                                headers: r,
                                body: o
                            } = t;
                            e(null, {
                                status: s,
                                statusCode: i,
                                headers: r,
                                body: o
                            }, o);
                        }, t => {
                            const {
                                message: s,
                                response: i
                            } = t;
                            e(s, i, i && i.body);
                        }));
                }
                post(t, e = (() => { })) {
                    if (t.body && t.headers && !t.headers["Content-Type"] && (t.headers["Content-Type"] = "application/x-www-form-urlencoded"), t.headers && delete t.headers["Content-Length"], this.isSurge() || this.isLoon())
                        this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, {
                            "X-Surge-Skip-Scripting": !1
                        })), $httpClient.post(t, (t, s, i) => {
                            !t && s && (s.body = i, s.statusCode = s.status),
                                e(t, s, i);
                        });
                    else if (this.isQuanX())
                        t.method = "POST", this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, {
                            hints: !1
                        })), $task.fetch(t).then(t => {
                            const {
                                statusCode: s,
                                statusCode: i,
                                headers: r,
                                body: o
                            } = t;
                            e(null, {
                                status: s,
                                statusCode: i,
                                headers: r,
                                body: o
                            }, o);
                        }, t => e(t));
                    else if (this.isNode()) {
                        this.initGotEnv(t);
                        const {
                            url: s,
                            ...i
                        } = t;
                        this.got.post(s, i).then(t => {
                            const {
                                statusCode: s,
                                statusCode: i,
                                headers: r,
                                body: o
                            } = t;
                            e(null, {
                                status: s,
                                statusCode: i,
                                headers: r,
                                body: o
                            }, o);
                        }, t => {
                            const {
                                message: s,
                                response: i
                            } = t;
                            e(s, i, i && i.body);
                        });
                    }
                }
                time(t, e = null) {
                    const s = e ? new Date(e) : new Date;
                    let i = {
                        "M+": s.getMonth() + 1,
                        "d+": s.getDate(),
                        "H+": s.getHours(),
                        "m+": s.getMinutes(),
                        "s+": s.getSeconds(),
                        "q+": Math.floor((s.getMonth() + 3) / 3),
                        S: s.getMilliseconds()
                    };
                    /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length)));
                    for (let e in i)
                        new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length)));
                    return t;
                }
                msg(e = t, s = "", i = "", r) {
                    const o = t => {
                        if (!t)
                            return t;
                        if ("string" == typeof t)
                            return this.isLoon() ? t : this.isQuanX() ? {
                                "open-url": t
                            }
                                : this.isSurge() ? {
                                    url: t
                                }
                                    : void 0;
                        if ("object" == typeof t) {
                            if (this.isLoon()) {
                                let e = t.openUrl || t.url || t["open-url"],
                                    s = t.mediaUrl || t["media-url"];
                                return {
                                    openUrl: e,
                                    mediaUrl: s
                                };
                            }
                            if (this.isQuanX()) {
                                let e = t["open-url"] || t.url || t.openUrl,
                                    s = t["media-url"] || t.mediaUrl;
                                return {
                                    "open-url": e,
                                    "media-url": s
                                };
                            }
                            if (this.isSurge()) {
                                let e = t.url || t.openUrl || t["open-url"];
                                return {
                                    url: e
                                };
                            }
                        }
                    };
                    if (this.isMute || (this.isSurge() || this.isLoon() ? $notification.post(e, s, i, o(r)) : this.isQuanX() && $notify(e, s, i, o(r))), !this.isMuteLog) {
                        let t = ["", "==============📣系统通知📣=============="];
                        t.push(e),
                            s && t.push(s),
                            i && t.push(i),
                            console.log(t.join("\n")),
                            this.logs = this.logs.concat(t);
                    }
                }
                log(...t) {
                    t.length > 0 && (this.logs = [...this.logs, ...t]),
                        console.log(t.join(this.logSeparator));
                }
                logErr(t, e) {
                    const s = !this.isSurge() && !this.isQuanX() && !this.isLoon();
                    s ? this.log("", `❗️${this.name}, 错误!`, t.stack) : this.log("", `❗️${this.name}, 错误!`, t);
                }
                wait(t) {
                    return new Promise(e => setTimeout(e, t));
                }
                done(t = {}) {
                    const e = (new Date).getTime(),
                        s = (e - this.startTime) / 1e3;
                    this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`),
                        this.log(),
                        (this.isSurge() || this.isQuanX() || this.isLoon()) && $done(t);
                }
            }
                (t, e);
        }

        //获取现在的备注
        async function GetQlRemarks(pin) {
            try {
                let open = false,
                    remarks1 = '';
                for (let i = 0; i < qlDbArr.length; i++) {
                    let oneAllEnvs = await QlMod.GetQlAllEnvs(qlDbArr, i);
                    if (!oneAllEnvs.status) {
                        await s.reply(oneAllEnvs.msg);
                        return null;
                    }
                    oneAllEnvs = oneAllEnvs.data;
                    for (let k = 0; k < oneAllEnvs.length; k++) {
                        if (oneAllEnvs[k]['name'] === 'JD_COOKIE') {
                            let nowPin = oneAllEnvs[k]['value'].match(/(?<=pt_pin=)[^;]+/g)[0];
                            if (nowPin !== pin) continue;
                            remarks1 = oneAllEnvs[k]['remarks'] || '';
                            open = true;
                            break;
                        }
                    }
                    if (open) return remarks1; // 返回备注
                }
                return ''; //所有容器中均没有该pin
            } catch (e) {
                console.error(e);
                return '';
            }
        }

        async function GetDayBend() {
            let listArr = [],
                Rankings = [],
                allJd = 0,
                rankingLogs = ``,
                nowLogs = ``,
                zhichu = 0;
            listArr = await beanList();
            if (!listArr) return s.reply('京东api异常');
            else if (listArr.length === 0) return s.reply('该账号今日无收');
            let num = 3;
            for (const e of listArr) {
                let amount = +e['amount'];
                let eventMsg = e['eventMassage'].replace(/[参加\[\]\-奖励]/g, '');
                let date = e['date'];
                let dates = date.match(/(?<= )\S+/g);
                if (amount > 0) allJd += amount;
                else zhichu += amount;
                let index = Rankings.findIndex(e => {
                    return e['eventMassage'] == eventMsg;
                });
                if (index == -1) Rankings.push({ amount: amount, eventMassage: eventMsg, date: date });
                else Rankings[index]['amount'] += amount;
                if (num > 0) nowLogs += `${amount}豆 ${dates} 【${eventMsg}】\n`;
                num--;
            }
            /* 根据收入排序数组 */
            Rankings.sort((a, b) => {
                return b['amount'] - a['amount'];
            });
            Rankings.forEach(
                e =>
                    e['amount'] >= (beanLimit || 10) &&
                    (rankingLogs += `${e['amount']}豆 【${e['eventMassage']}】\n`)
            );
            beanLimit ? (rankingLogs += `\n设置了隐藏${beanLimit}豆以下信息...\n`) : '';
            rankingLogs = rankingLogs == '' ? rankingLogs : `【排行】\n` + rankingLogs + `...\n`;
            nowLogs = nowLogs == '' ? nowLogs : `【最新收入】\n` + nowLogs;
            let dayLogs = maxDay ? `前${maxDay}天` : '今日';
            let logs = `账号名称：${userName}\n${dayLogs}总收：${allJd}${
                zhichu !== 0 ? `\n${dayLogs}总支：${-zhichu}` : ''
            }\n\n${rankingLogs}${nowLogs}`;
            let sendID = await s.reply(logs);
            if (deleteMsgTime !== 0) s.delMsg(msgId, sendID, { wait: +deleteMsgTime });
            if (maxDayId !== sendID) s.delMsg(maxDayId, { wait: +deleteMsgTime });

            async function beanList() {
                // 当天时间戳0:0:0时间戳
                const nowTime = new Date(new Date().setHours(0, 0, 0, 0)) / 1;
                // 查询指定天数的时间戳
                const tm1 = maxDay > 1 ? nowTime - 86400000 * (maxDay || 1) : nowTime;
                // 查询指定天数的时间前一天的0:0:0时间戳
                const tm = tm1 - 86400000;

                let page = 1,
                    t = 0,
                    yesterdayArr = [],
                    todayArr = [];
                // return [];
                do {
                    let response = await getJingBeanBalanceDetail(page);
                    await sysMethod.sleep(0.1);
                    // console.log(`第${page}页: ${JSON.stringify(response)}`);
                    if (response && response.code === '0') {
                        page++;
                        let detailList = response.jingDetailList;
                        if (detailList && detailList.length > 0) {
                            for (let item of detailList) {
                                const date = item.date.replace(/-/g, '/') + '+08:00';
                                if (
                                    new Date(date).getTime() >= tm1 &&
                                    !item['eventMassage'].includes('退还') &&
                                    !item['eventMassage'].includes('物流') &&
                                    !item['eventMassage'].includes('扣赠')
                                ) {
                                    todayArr.push(item);
                                } else if (
                                    tm <= new Date(date).getTime() &&
                                    new Date(date).getTime() < tm1 &&
                                    !item['eventMassage'].includes('退还') &&
                                    !item['eventMassage'].includes('物流') &&
                                    !item['eventMassage'].includes('扣赠')
                                ) {
                                    //昨日的
                                    break;
                                    // yesterdayArr.push(item);
                                } else if (tm > new Date(date).getTime()) {
                                    //前天的
                                    t = 1;
                                    break;
                                }
                            }
                        } else {
                            console.error(`数据异常`);
                            t = 1;
                        }
                    } else if (response && response.code === '3') {
                        console.log(`cookie已过期，或者填写不规范，跳出`);
                        t = 1;
                    } else {
                        console.log(`未知情况：${JSON.stringify(response)}`);
                        console.log(`未知情况，跳出`);
                        return null;
                        t = 1;
                    }
                } while (t === 0);

                return todayArr;
            }
        }
    }
};

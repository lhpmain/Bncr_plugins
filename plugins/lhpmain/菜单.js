/**作者
 * @author lhpmain
 * @name 菜单
 * @team lhpmain
 * @version 1.0
 * @description 私人定制
 * @rule ^(菜单)$
 * @admin true
 * @public true
 * @priority 1
 * @disable false
 * @classification ["私人定制菜单命令"]
 */
module.exports = async s => {
    
    if (s.param(1) === '菜单') {
        await s.reply(`┄┅┄┅┄┅┄┅┄┅┄┅┄ ❤️💗菜单选项列表💗❤️ ┄┅┄┅┄┅┄┅┄┅┄┅┄ 
        登录 ║ 账密，短信/扫码登录查询 ║
        查询 ║ 查询豆豆明细 ║
        账号管理 ║管理/删除账户║
        密码管理 ║删除密码登录账户║
        天气查询 ║带上地名 **天气`);
           
    }
};
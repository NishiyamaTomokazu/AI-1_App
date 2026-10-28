// step4.js (STEP4 分岐処理): 雛形
const comm = window.parent.comm;

// 親画面(index.html)の STEP5 タブを開く
window.goToNext = function() {
    if (window.parent && window.parent.showPageById) {
        window.parent.showPageById('tab-step5');
    }
};

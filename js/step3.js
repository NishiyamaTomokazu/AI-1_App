// step3.js (STEP3 反復処理): 雛形
const comm = window.parent.comm;

// 親画面(index.html)の STEP4 タブを開く
window.goToNext = function() {
    if (window.parent && window.parent.showPageById) {
        window.parent.showPageById('tab-step4');
    }
};

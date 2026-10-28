// step5.js (STEP5 総合): 雛形
const comm = window.parent.comm;

// 親画面(index.html)の STEP6 タブを開く
window.goToNext = function() {
    if (window.parent && window.parent.showPageById) {
        window.parent.showPageById('tab-step6');
    }
};

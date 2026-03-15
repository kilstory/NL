import { supabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const signInForm = document.getElementById('signInForm');
    const registerForm = document.getElementById('registerForm');
    
    // Login Handling
    if (signInForm) {
        signInForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const btn = document.getElementById('signInBtn');
            const errorEl = document.getElementById('loginPasswordError');

            btn.disabled = true;
            btn.textContent = '로그인 중...';
            errorEl.style.display = 'none';

            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) throw error;

                // Success
                alert('로그인 성공!');
                window.location.href = 'nl.html';
            } catch (error) {
                errorEl.textContent = error.message;
                errorEl.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = '로그인';
            }
        });
    }

    // Signup Handling
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('regEmail').value;
            const password = document.getElementById('regPassword').value;
            const confirm = document.getElementById('regPasswordConfirm').value;
            const btn = document.getElementById('signUpBtn');

            if (password !== confirm) {
                alert('비밀번호가 일치하지 않습니다.');
                return;
            }

            btn.disabled = true;
            btn.textContent = '처리 중...';

            try {
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                });

                if (error) throw error;

                alert('회원가입 신청이 완료되었습니다. 이메일을 확인해주세요!');
                location.reload();
            } catch (error) {
                alert('회원가입 실패: ' + error.message);
            } finally {
                btn.disabled = false;
                btn.textContent = '회원가입';
            }
        });
    }
});

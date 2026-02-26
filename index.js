const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs'); // 🔥 데이터 저장을 위한 핵심 파일 시스템 모듈 추가!

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    maxHttpBufferSize: 1e8 
});

app.use(express.static(path.join(__dirname, 'public')));

// 📂 데이터베이스 파일 경로 설정
const DATA_FILE = path.join(__dirname, 'archive.json');
const USERS_FILE = path.join(__dirname, 'users.json');

// 시스템 메모리
let archiveData = [];
let users = []; 

// 🔄 서버가 켜질 때 저장된 데이터 불러오기
if (fs.existsSync(DATA_FILE)) {
    archiveData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    console.log(`📦 기존 아카이브 데이터 ${archiveData.length}개 복구 완료!`);
}
if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    console.log(`👥 등록된 마스터 ${users.length}명 복구 완료!`);
}

// 💾 데이터를 파일에 영구 저장하는 함수
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(archiveData, null, 2)); }
function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }

io.on('connection', (socket) => {
    // 접속하자마자 복구된 데이터 쏴주기
    socket.emit('initial_load', archiveData);
    io.emit('user_list', users.map(u => u.name));

    socket.on('auth_request', (data) => {
        let user = users.find(u => u.name === data.name);
        if (!user) { 
            user = { name: data.name, password: data.password }; 
            users.push(user); 
            saveUsers(); // 신규 가입 시 즉시 저장!
        }
        if (user.password === data.password) {
            socket.emit('auth_success', { name: data.name });
            io.emit('user_list', users.map(u => u.name));
        } else { 
            socket.emit('auth_fail', "비밀번호 불일치"); 
        }
    });

    socket.on('new_spark', (data) => {
        const newPost = { ...data, likedBy: [], comments: [] };
        archiveData.unshift(newPost);
        saveData(); // ✨ 글 쓸 때마다 즉시 저장!
        io.emit('receive_spark', newPost);

        const mentions = data.content.match(/@(\S+)/g);
        if (mentions) {
            mentions.forEach(m => {
                const targetName = m.replace('@', '');
                io.emit('mention_notification', { target: targetName, sender: data.name, postId: data.id });
            });
        }
    });

    socket.on('delete_post', (data) => {
        const index = archiveData.findIndex(p => p.id === data.postId);
        if (index !== -1 && archiveData[index].name === data.userName) {
            archiveData.splice(index, 1);
            saveData(); // 🔥 삭제할 때도 즉시 반영!
            io.emit('post_deleted', data.postId);
        }
    });

    socket.on('like_post', (data) => {
        const post = archiveData.find(p => p.id === data.postId);
        if (post && !post.likedBy.includes(data.userName)) {
            post.likedBy.push(data.userName);
            post.likes = post.likedBy.length;
            saveData(); // ❤️ 좋아요 누를 때도 저장!
            io.emit('update_likes', { postId: data.postId, likes: post.likes });
        }
    });

    socket.on('new_comment', (data) => {
        const post = archiveData.find(p => p.id === data.postId);
        if (post) { 
            post.comments.push(data.comment); 
            saveData(); // 💬 댓글 달 때도 저장!
            io.emit('receive_comment', data); 
        }
    });
});

server.listen(3000, () => console.log('🚀 MASTER SYSTEM ONLINE (DATABASE ACTIVE)'));
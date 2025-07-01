<h1 x-text="ajaxify.data.topic_title"></h1>
<div id="posts">
  <template x-for="post in ajaxify.data.posts" :key="post.pid">
    <div class="post" x-html="post.content"></div>
  </template>
</div>
<hr>
<form @submit.prevent="submitReply()">
  <textarea x-model="replyContent" placeholder="Write a reply..."></textarea>
  <button type="submit">Post Reply</button>
</form>
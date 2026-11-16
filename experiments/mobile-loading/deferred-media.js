(() => {
 const videos=[...document.querySelectorAll('video[data-preview-poster]')];
 const reveal=video=>{
  video.poster=video.dataset.previewPoster;
  delete video.dataset.previewPoster;
 };
 if(!('IntersectionObserver' in window)){videos.forEach(reveal);return;}
 const observer=new IntersectionObserver(entries=>{
  for(const entry of entries) if(entry.isIntersecting){
   reveal(entry.target); observer.unobserve(entry.target);
  }
 },{rootMargin:'200px'});
 videos.forEach(video=>observer.observe(video));
})();

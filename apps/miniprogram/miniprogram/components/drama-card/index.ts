Component({
  properties: {
    drama: { type: Object },
    compact: { type: Boolean, value: false }
  },
  methods: {
    open() {
      const drama = (this.data as { drama?: { id?: string } }).drama;
      if (!drama?.id) return;
      wx.navigateTo({ url: `/pages/drama/index?id=${encodeURIComponent(drama.id)}` });
    }
  }
});

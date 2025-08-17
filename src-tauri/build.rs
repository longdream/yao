use std::{fs, path::Path};

fn ensure_icon() -> std::io::Result<()> {
  let icon_dir = Path::new("icons");
  if !icon_dir.exists() {
    fs::create_dir_all(icon_dir)?;
  }
  let ico_path = icon_dir.join("icon.ico");
  if !ico_path.exists() {
    // try to generate from project's public logo if present
    let png_path = Path::new("../public/images/yaologo-1.png");
    if png_path.exists() {
      if let Ok(img) = image::open(png_path) {
        let rgba = img.to_rgba8();
        let (w, h) = rgba.dimensions();
        let mut icon_dir = ico::IconDir::new(ico::ResourceType::Icon);
        let icon_img = ico::IconImage::from_rgba_data(w as u32, h as u32, rgba.into_raw());
        icon_dir.add_entry(ico::IconDirEntry::encode(&icon_img).unwrap());
        let mut file = fs::File::create(&ico_path)?;
        icon_dir.write(&mut file)?;
      } else {
        let mut image = ico::IconDir::new(ico::ResourceType::Icon);
        let data = vec![0u8, 0, 0, 255];
        let entry = ico::IconImage::from_rgba_data(1, 1, data);
        image.add_entry(ico::IconDirEntry::encode(&entry).unwrap());
        let mut file = fs::File::create(&ico_path)?;
        image.write(&mut file)?;
      }
    } else {
      let mut image = ico::IconDir::new(ico::ResourceType::Icon);
      let data = vec![0u8, 0, 0, 255];
      let entry = ico::IconImage::from_rgba_data(1, 1, data);
      image.add_entry(ico::IconDirEntry::encode(&entry).unwrap());
      let mut file = fs::File::create(&ico_path)?;
      image.write(&mut file)?;
    }
  }
  Ok(())
}

fn main() {
  let _ = ensure_icon();
  tauri_build::build()
}



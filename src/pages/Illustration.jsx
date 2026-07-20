import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";

// Liste des images à afficher dans la galerie
const images = [
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration3.jpg", alt: "", categories: ["paintings"], date: "01-02-2025" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration17-3.jpg", alt: "", categories: ["paintings","character-design"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration22-2.jpg", alt: "", categories: ["illustrations","character-design"], date: "04-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration25.jpg", alt: "", categories: ["illustrations"], date: "07-01-2025" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration27-v2.jpg", alt: "", categories: ["illustrations","character-design"], date: "14-12-2024" },

  // MAJ 22/03/2025
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration27.jpg", alt: "", categories: ["illustrations"], date: "24-07-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/kanibal.jpg", alt: "", categories: ["paintings","character-design"], date: "04-03-2023" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration36.jpg", alt: "", categories: ["illustrations","character-design"], date: "30-04-2023" },
  { src: "/test-portfolio-mangaka/assets/illustration/BD.jpg", alt: "", categories: ["paintings","character-design"], date: "10-05-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/01-4.jpg", alt: "", categories: ["illustrations"], date: "27-10-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration.jpg", alt: "", categories: ["illustrations"], date: "21-11-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/04.jpg", alt: "", categories: ["illustrations","character-design"], date: "14-12-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration29.jpg", alt: "", categories: ["sketches"], date: "10-02-2025" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration29-1.jpg", alt: "", categories: ["sketches"], date: "10-02-2025" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration29-2.jpg", alt: "", categories: ["sketches"], date: "10-02-2025" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration29-3.jpg", alt: "", categories: ["sketches"], date: "10-02-2025" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration30.jpg", alt: "", categories: ["sketches"], date: "24-02-2025" },
  { src: "/test-portfolio-mangaka/assets/illustration/couverture.jpg", alt: "", categories: ["illustrations"], date: "02-03-2025" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration28-3-1.jpg", alt: "", categories: ["illustrations", "paintings"], date: "07-01-2025" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration11.jpg", alt: "", categories: ["illustrations"], date: "11-05-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration13.jpg", alt: "", categories: ["illustrations"], date: "12-05-2024" },

  // MAJ 23/03/2025
  { src: "/test-portfolio-mangaka/assets/illustration/01.jpg", alt: "", categories: ["sketches"], date: "07-01-2025" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration10.jpg", alt: "", categories: ["illustrations"], date: "09-05-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration14.jpg", alt: "", categories: ["sketches","character-design"], date: "12-05-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration19.jpg", alt: "", categories: ["sketches","character-design"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration20.jpg", alt: "", categories: ["sketches","character-design"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration21.jpg", alt: "", categories: ["sketches","character-design"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration5-2.jpg", alt: "", categories: ["illustrations"], date: "20-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Illustration7.jpg", alt: "", categories: ["sketches"], date: "15-09-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/kin (20231228013839).jpg", alt: "", categories: ["illustrations","paintings"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/luo (20231228023449).jpg", alt: "", categories: ["illustrations","paintings"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240423_232157 (2).jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240423_233203.jpg", alt: "", categories: ["sketches"], date: "10-05-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240429_233642 (2).jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240429_234220 (2).jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240506_011226 (2).jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240507_005313 (2).jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240507_005521 (2).jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240507_010510 (2).jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240511_145948.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240611_003114.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240611_005219.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240611_010536.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240618_000414.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240618_000553.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240628_144529.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240628_145255.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240628_145702.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240628_150131.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240628_150915.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240628_151941.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240628_152713.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240628_153642.jpg", alt: "", categories: ["sketches"], date: "28-06-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/profil 150921.jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20230814091800).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240102030156).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240116110047).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226010017).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226010037).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226010042).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226010100).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226010113).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226010122).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226010133).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226010521).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226122807).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226122819).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123309).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123326).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123338).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123350).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123426).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123437).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123446).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123456).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123505).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123513).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123522).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123539).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123552).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123602).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123618).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123653).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123703).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123725).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123738).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123751).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226123819).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226124910).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226124918).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226124930).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125009).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125051).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125102).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125119).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125131).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125151).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125237).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125255).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125307).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125335).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125351).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125504).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125513).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125525).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125534).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125548).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125617).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125632).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125701).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125718).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125733).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125746).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125807).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125825).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125840).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125851).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125857).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125913).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125923).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125928).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125940).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125950).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet (20240226125955).jpg", alt: "", categories: ["sketches"], date: "26-02-2024" },

  // MAJ 23/03/2025 (suite)
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240714_030506.jpg", alt: "", categories: ["sketches"], date: "14-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240717_041718.jpg", alt: "", categories: ["sketches"], date: "17-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240717_042244.jpg", alt: "", categories: ["sketches"], date: "17-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240717_042500.jpg", alt: "", categories: ["sketches"], date: "17-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240717_042532.jpg", alt: "", categories: ["sketches"], date: "17-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240717_042549.jpg", alt: "", categories: ["sketches"], date: "17-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240717_042555.jpg", alt: "", categories: ["sketches"], date: "17-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240722_025131.jpg", alt: "", categories: ["sketches"], date: "22-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240722_025419.jpg", alt: "", categories: ["sketches"], date: "22-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240722_025719.jpg", alt: "", categories: ["sketches"], date: "22-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240722_030339.jpg", alt: "", categories: ["sketches"], date: "22-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240722_031103.jpg", alt: "", categories: ["sketches"], date: "22-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240722_032054.jpg", alt: "", categories: ["sketches"], date: "22-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240723_011320.jpg", alt: "", categories: ["sketches"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240723_013557.jpg", alt: "", categories: ["sketches"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240723_013909.jpg", alt: "", categories: ["sketches"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240723_014650.jpg", alt: "", categories: ["sketches"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240723_015116.jpg", alt: "", categories: ["sketches"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240723_020323.jpg", alt: "", categories: ["sketches"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240723_021440.jpg", alt: "", categories: ["sketches"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240723_021840.jpg", alt: "", categories: ["sketches"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240723_023856.jpg", alt: "", categories: ["sketches"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240723_030339.jpg", alt: "", categories: ["sketches"], date: "23-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240724_034020.jpg", alt: "", categories: ["sketches"], date: "24-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240724_034750.jpg", alt: "", categories: ["sketches"], date: "24-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240724_035935.jpg", alt: "", categories: ["sketches"], date: "24-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240724_040058.jpg", alt: "", categories: ["sketches"], date: "24-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240724_040957.jpg", alt: "", categories: ["sketches"], date: "24-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240724_041353.jpg", alt: "", categories: ["sketches"], date: "24-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240724_042221.jpg", alt: "", categories: ["sketches"], date: "24-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240724_043029.jpg", alt: "", categories: ["sketches"], date: "24-07-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240801_001331.jpg", alt: "", categories: ["sketches"], date: "01-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240801_001847.jpg", alt: "", categories: ["sketches"], date: "01-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240801_005052.jpg", alt: "", categories: ["sketches"], date: "01-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240804_231445.jpg", alt: "", categories: ["sketches"], date: "04-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240804_233000.jpg", alt: "", categories: ["sketches"], date: "04-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240805_003251.jpg", alt: "", categories: ["sketches"], date: "05-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240805_004453.jpg", alt: "", categories: ["sketches"], date: "05-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240805_005937.jpg", alt: "", categories: ["sketches"], date: "05-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240805_013521.jpg", alt: "", categories: ["sketches"], date: "05-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240805_013941.jpg", alt: "", categories: ["sketches"], date: "05-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240806_030937.jpg", alt: "", categories: ["sketches"], date: "06-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240806_034740.jpg", alt: "", categories: ["sketches"], date: "06-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240807_231300.jpg", alt: "", categories: ["sketches"], date: "07-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240807_231430.jpg", alt: "", categories: ["sketches"], date: "07-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240807_233653.jpg", alt: "", categories: ["sketches"], date: "07-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240807_234359.jpg", alt: "", categories: ["sketches"], date: "07-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240807_234805.jpg", alt: "", categories: ["sketches"], date: "07-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240807_235140.jpg", alt: "", categories: ["sketches"], date: "07-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240808_003453.jpg", alt: "", categories: ["sketches"], date: "08-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240808_004112.jpg", alt: "", categories: ["sketches"], date: "08-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240808_004211.jpg", alt: "", categories: ["sketches"], date: "08-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240808_005040.jpg", alt: "", categories: ["sketches"], date: "08-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240808_012250.jpg", alt: "", categories: ["sketches"], date: "08-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240831_001348.jpg", alt: "", categories: ["sketches"], date: "31-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240831_013140.jpg", alt: "", categories: ["sketches"], date: "31-08-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240908_232341.jpg", alt: "", categories: ["sketches"], date: "08-09-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240910_010629.jpg", alt: "", categories: ["sketches"], date: "10-09-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240911_190120.jpg", alt: "", categories: ["sketches"], date: "11-09-2024" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_20240918_231645.jpg", alt: "", categories: ["sketches"], date: "18-09-2024" },

  // MAJ 23/03/2025 (suite 2)
  { src: "/test-portfolio-mangaka/assets/illustration/penup_02-02-2022.jpg", alt: "", categories: ["sketches"], date: "02-02-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_03-07-2020-1.jpg", alt: "", categories: ["sketches"], date: "03-07-2020" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_03-07-2020-2.jpg", alt: "", categories: ["sketches"], date: "03-07-2020" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_03-07-2020.jpg", alt: "", categories: ["sketches"], date: "03-07-2020" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_04-06-2021.jpg", alt: "", categories: ["sketches"], date: "04-06-2021" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_07-02-2022.jpg", alt: "", categories: ["sketches"], date: "07-02-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_09-01-2022-penup_-penup_1641768564246032.jpg", alt: "", categories: ["sketches"], date: "09-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_09-01-2022-penup_-penup_1641768589706342.jpg", alt: "", categories: ["sketches"], date: "09-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_09-01-2022-penup_-penup_1641768611865362.jpg", alt: "", categories: ["sketches"], date: "09-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_09-01-2022-penup_-penup_1641768654674542.jpg", alt: "", categories: ["sketches"], date: "09-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_09-01-2022-penup_-penup_1641768711687112.jpg", alt: "", categories: ["sketches"], date: "09-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_09-01-2022.jpg", alt: "", categories: ["sketches"], date: "09-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_11-01-2022-penup_-penup_1641871602789392.jpg", alt: "", categories: ["sketches"], date: "11-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_11-01-2022-penup_-penup_1641871626648532.jpg", alt: "", categories: ["sketches"], date: "11-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_11-01-2022-penup_-penup_1641871646967982.jpg", alt: "", categories: ["sketches"], date: "11-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_11-01-2022.jpg", alt: "", categories: ["sketches"], date: "11-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_13-07-2020-penup_-penup_1594664333869552.jpg", alt: "", categories: ["sketches"], date: "13-07-2020" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_13-07-2020.jpg", alt: "", categories: ["sketches"], date: "13-07-2020" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642129667833012.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642129685745752.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642129706543332.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642129738290092.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642129758503272.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642129776460232.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642129803113432.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642129829818432.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642129892017852.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642129916380182.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642129943632072.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642129973790462.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642129998101762.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642130019740272.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022-penup_-penup_1642195680823302.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-01-2022.jpg", alt: "", categories: ["sketches"], date: "14-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-02-2022-penup_-penup_1644799468483282.jpg", alt: "", categories: ["sketches"], date: "14-02-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_14-02-2022.jpg", alt: "", categories: ["sketches"], date: "14-02-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2020.jpg", alt: "", categories: ["sketches"], date: "15-01-2020" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273217378022.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273257242192.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273287778392.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273340552382.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273366109352.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273428586312.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273458718442.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273476174552.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273495914172.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273545324462.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273579642412.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273600076262.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273623719912.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273644197742.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273669733412.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273705576122.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273726691912.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_-penup_1642273743166142.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_1642273123023382.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022-penup_1642273201999632.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-01-2022.jpg", alt: "", categories: ["sketches"], date: "15-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-02-2022-penup_-penup_1644880973302872.jpg", alt: "", categories: ["sketches"], date: "15-02-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-02-2022-penup_-penup_1644881003075282.jpg", alt: "", categories: ["sketches"], date: "15-02-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_15-02-2022.jpg", alt: "", categories: ["sketches"], date: "15-02-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_22-02-2022-penup_-penup_1645520634922292.jpg", alt: "", categories: ["sketches"], date: "22-02-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_22-02-2022-penup_-penup_1645520669121172.jpg", alt: "", categories: ["sketches"], date: "22-02-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_22-02-2022-penup_-penup_1645520718292302.jpg", alt: "", categories: ["sketches"], date: "22-02-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_22-02-2022.jpg", alt: "", categories: ["sketches"], date: "22-02-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-28-09.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-28-30.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-28-51.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-29-36.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-29-38.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-31-03.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-31-24.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-31-42.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-32-01.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-32-22.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-32-44.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-33-02.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-33-23.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-35-42.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-38-00.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-38-27.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-39-04.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-39-31.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-40-47.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-41-07.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-41-29.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-41-51.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-42-14.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-42-57.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-43-40.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-44-00.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-44-25.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-56-02.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-56-23.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-57-15.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-57-48.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-58-26.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-58-45.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_21-59-27.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-00-13.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-00-40.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-01-00.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-01-26.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-01-46.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-02-23.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-02-40.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-02-55.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-03-24.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-03-56.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-04-17.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-04-41.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-05-21.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-05-38.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-06-05.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-06-22.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-07-26.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-07-49.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-08-07.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-08-26.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-08-44.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-09-07.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-09-32.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-10-10.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-10-28.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-11-03.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-11-20.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-11-47.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-12-05.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-15-13.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-15-32.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-16-39.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-16-59.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-17-59.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-18-21.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-18-40.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-18-57.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-19-23.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-19-43.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-20-03.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-20-18.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-21-19.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-21-37.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-21-53.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-22-12.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-22-29.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-22-44.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-23-00.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-23-21.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-23-44.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-25-32.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-26-09.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-01-2022_22-26-33.jpg", alt: "", categories: ["sketches"], date: "23-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_23-10-2019.jpg", alt: "", categories: ["sketches"], date: "23-10-2019" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_25-10-2019.jpg", alt: "", categories: ["sketches"], date: "25-10-2019" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_26-07-2021.jpg", alt: "", categories: ["sketches"], date: "26-07-2021" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_26-09-2023-penup_-penup_1695760328272312.jpg", alt: "", categories: ["sketches"], date: "26-09-2023" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_26-09-2023-penup_-penup_1695760688057032.jpg", alt: "", categories: ["sketches"], date: "26-09-2023" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_26-09-2023.jpg", alt: "", categories: ["sketches"], date: "26-09-2023" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_27-01-2022-penup_-penup_1643321899912552.jpg", alt: "", categories: ["sketches"], date: "27-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_27-01-2022.jpg", alt: "", categories: ["sketches"], date: "27-01-2022" },
  { src: "/test-portfolio-mangaka/assets/illustration/penup_27-09-2020.jpg", alt: "", categories: ["sketches"], date: "27-09-2020" },
  { src: "/test-portfolio-mangaka/assets/illustration/Projet_16-11-2021", alt: "", categories: ["sketches"], date: "27-09-2020" },

];

const Illustration = () => {
  const [filter, setFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("recent"); // "recent" ou "oldest"

  useEffect(() => {
    Fancybox.bind("[data-fancybox='gallery']");
  }, []);

  // Filtrer les images par catégorie
  let filteredImages = images.filter(image => filter === "all" || image.categories.includes(filter));

// Fonction pour convertir "DD-MM-YYYY" en "YYYY-MM-DD" pour un tri correct
const parseDate = (date) => {
  const [day, month, year] = date.split("-");
  return new Date(`${year}-${month}-${day}`);
};

// Trier les images par date (récent -> ancien ou ancien -> récent)
filteredImages = filteredImages.sort((a, b) => {
  return sortOrder === "recent" 
    ? parseDate(b.date) - parseDate(a.date) 
    : parseDate(a.date) - parseDate(b.date);
});

  // Formater la date
  const formatDate = (date) => {
    const [day, month, year] = date.split("-");
    return `${day}-${month}-${year}`;
};

  return (
    <div className="mx-auto px-6 pt-16 min-h-screen bg-light-background dark:bg-dark-background">
      
      {/* Titre animé */}
      <motion.h1
        className="text-3xl font-semibold text-center mb-6 uppercase tracking-wide pt-12"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        Galerie d'Illustrations
      </motion.h1>

      {/* Filtres et tri */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="flex flex-wrap justify-center gap-4 mb-6"
      >
        {/* Bouton de tri par date */}
        <button
          className="px-4 py-1.5 text-sm font-medium uppercase border border-blue-400 text-gray-600 
            hover:border-blue-800 hover:text-blue-800 dark:text-gray-300 dark:border-blue-400 dark:hover:border-blue-600 transition-all duration-200"
          onClick={() => setSortOrder(sortOrder === "recent" ? "oldest" : "recent")}
        >
          Trier par : {sortOrder === "recent" ? "Plus ancien" : "Plus récent"}
        </button>

        {/* Filtres par catégorie */}
        {["all", "illustrations", "sketches", "paintings" , "character-design"].map((category) => (
          <button
            key={category}
            className={`px-4 py-1.5 text-sm font-medium uppercase transition-all duration-200 border 
              ${filter === category 
                ? "border-blue-600 text-blue-400 shadow-sm" 
                : "border-gray-400 text-gray-600 hover:border-gray-700 hover:text-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:border-gray-400"}
            `}
            onClick={() => setFilter(category)}
          >
            {category === "all" ? "Tout" : category.charAt(0).toUpperCase() + category.slice(1)}
          </button>
        ))}

      </motion.div>

      {/* Grille des images */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
        }}
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 pt-3"
      >
        {filteredImages.map((image, index) => (
          <motion.div 
            key={index}
            className="overflow-hidden shadow-sm cursor-pointer border border-gray-300 dark:border-gray-700 rounded-sm"
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.2 }}
          >
            <a href={image.src} data-fancybox="gallery" data-caption={image.alt}>
              <img 
                src={image.src} 
                alt={image.alt} 
                className="w-full h-48 object-cover transition-all duration-300 hover:opacity-85"
                loading="lazy"
              />
            </a>
            {/* Date sous l'image */}
            <div className="font-semibold text-center text-sm text-gray-500 dark:text-gray-400 dark:bg-gray-800 py-2 pb-2">
              {formatDate(image.date)}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default Illustration;
